// main.js — boot and the one loop: a fixed 60 Hz simulation feeding a render
// at the display's rate. Round flow (buy -> live -> end -> buy), the bomb,
// the shop and the ?shot= photo mode all live here; the sim modules do the
// rest. ?shot=1..4 with &seed=N sets up a deterministic frame, renders it
// twice, freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { createState, FIXED_STEP, ROUND_TIME, BUY_TIME, END_TIME, BOMB_TIME, PLANT_TIME, WIN_ROUNDS, WEAPONS, GRENADE_PRICE, ARMOR_PRICE, KILL_REWARD, WIN_REWARD, LOSS_REWARD, PLANT_REWARD, TEAMS } from './state.js';
import { createMap, MAP_NAME } from './map.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapons } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { inRect } from './collision.js';
import { clamp } from './util.js';

const params = new URLSearchParams(window.location.search);
const shot = Number.parseInt(params.get('shot') ?? '0', 10) || 0;
const seed = Number.parseInt(params.get('seed') ?? '7', 10) || 7;

const state = createState(seed);
state.shotMode = shot;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171a);
scene.fog = new THREE.Fog(0x14171a, 30, 72);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 160);
scene.add(camera);

const hemi = new THREE.HemisphereLight(0xcfd8e3, 0x2a2320, 0.9);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffe0b8, 2.2);
sun.position.set(18, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -30;
sun.shadow.camera.right = 30;
sun.shadow.camera.top = 30;
sun.shadow.camera.bottom = -30;
sun.shadow.camera.far = 80;
scene.add(sun);
// Cool fill from the west so the faces the spawn camera sees are not black.
const fill = new THREE.DirectionalLight(0x9fb4cc, 0.55);
fill.position.set(-20, 18, -8);
scene.add(fill);

const map = createMap(scene);
const audio = createAudio(state);
const hud = createHud(state, { onPlay: onPlayPressed, onBuy: buyItem });
const input = createInput(renderer.domElement, {
  onLockChange,
  onKeyDown: handleKeyDown,
  onLockFailed,
  onCanvasClick,
  lockWanted: () => !shot && (state.phase === 'live' || state.phase === 'buy' || state.phase === 'end'),
});
const player = createPlayer(state);
const weapons = createWeapons(state, camera, audio);

const combat = createCombat(state, scene, {
  onHit: (isHead) => {
    hud.hitMarker(false);
    audio.hit(false);
  },
  onKill: (bot, attacker, isHead) => {
    const killer = attacker === 'player' ? 'You' : attacker === 'bot' ? botKillerName(bot) : attacker;
    hud.addFeed(killer + ' ▸ ' + bot.name + (isHead ? '  (headshot)' : ''), attacker === 'player' ? 0 : bot.team);
    if (attacker === 'player') {
      state.money += KILL_REWARD;
      state.kills[0] += 1;
      hud.setMoney(state.money);
      hud.hitMarker(true);
      audio.hit(true);
    }
    if (state.phase === 'live') checkElimination();
  },
  onPlayerHurt: () => { hud.damageFlash(); audio.hurt(); },
  onPlayerDeath: () => {
    hud.addFeed('You were eliminated', 1);
    if (state.phase === 'live') {
      input.exitLock();
      hud.showOverlay('dead');
      checkElimination();
    }
  },
  onExplosion: (g) => {
    const d = Math.hypot(state.player.pos.x - g.x, state.player.pos.z - g.z);
    audio.explosion(d);
    state.noises.push({ x: g.x, z: g.z, radius: 40, ttl: 0.6 });
  },
});

const bots = createBots(state, scene, map, combat, {
  tracer: (a, b) => combat.spawnTracer(a, b),
  shotSound: (dist) => audio.shot(dist),
  beep: (final) => audio.beep(final),
  plantDone: (name) => {
    hud.addFeed(name + ' planted the charge', 0);
    hud.showBanner('BOMB PLANTED', 'Defend the Furnace until it blows — 35 seconds.', 3);
    audio.plantDone();
  },
  defuseDone: (name) => {
    hud.addFeed(name + ' defused the charge', 1);
    endRound(TEAMS.SLAG, 'The charge was defused.');
  },
  addFeed: (text, team) => hud.addFeed(text, team),
});

function botKillerName(victim) {
  // The killer is a bot; the feed names it by team colour only when unknown.
  return victim.team === TEAMS.EMBER ? 'Slag' : 'Ember';
}

// ---- round flow -----------------------------------------------------------

function startMatch() {
  state.score = [0, 0];
  state.kills = [0, 0];
  state.money = 800;
  state.round = 1;
  state.matchWinner = -1;
  state.player.hasRifle = false;
  state.player.grenades = 0;
  state.player.armor = 0;
  hud.hideEnd();
  startBuyPhase();
}

function startBuyPhase() {
  state.phase = 'buy';
  state.phaseT = BUY_TIME;
  resetPlayerToSpawn();
  bots.spawnRound();
  weapons.initArms();
  hud.setScore();
  hud.setMoney(state.money);
  hud.showBuy();
  hud.setBombStatus('');
  hud.setHint('');
  updateAmmoHud();
  hud.showBanner('ROUND ' + state.round, state.round === 1
    ? 'Buy what you need — the round starts soon.'
    : 'Buy phase — spend your winnings.', 2.5);
}

function startRound() {
  state.phase = 'live';
  state.phaseT = ROUND_TIME;
  hud.hideBuy();
  hud.setScore();
  hud.showBanner('ROUND ' + state.round, 'Plant the charge at the Furnace or eliminate Slag.', 2.5);
  updateAmmoHud();
  // The round starts unlocked whenever the previous round ended (endRound
  // exits the lock), so re-request it here: without this the player can
  // never aim or shoot again after round 1. A browser may refuse a request
  // with no recent user gesture; that failure falls back to drag-to-look,
  // and any canvas click retries the real lock.
  if (!shot) input.requestLock();
}

function endRound(winner, reason) {
  if (state.phase !== 'live') return;
  state.phase = 'end';
  state.phaseT = END_TIME;
  state.score[winner] += 1;
  state.roundWinner = winner;
  state.roundReason = reason;
  const playerWon = winner === TEAMS.EMBER;
  state.money += playerWon ? WIN_REWARD : LOSS_REWARD;
  hud.setScore();
  hud.setMoney(state.money);
  hud.showBanner(
    playerWon ? 'EMBER WINS THE ROUND' : 'SLAG WINS THE ROUND',
    reason + (playerWon ? '  +$' + WIN_REWARD : '  +$' + LOSS_REWARD),
    END_TIME,
  );
  if (playerWon) audio.roundWin(); else audio.roundLose();
  if (state.score[winner] >= WIN_ROUNDS) state.matchWinner = winner;
  input.exitLock();
}

function endMatch() {
  state.phase = 'matchEnd';
  const won = state.matchWinner === TEAMS.EMBER;
  hud.showEnd(
    won ? 'EMBER TAKES THE MATCH' : 'SLAG TAKES THE MATCH',
    'Final score ' + state.score[0] + ' – ' + state.score[1] + ' over ' + (state.round) + ' rounds. ' +
    (won ? 'The yard is yours.' : 'The yard stays theirs — run it back.'),
  );
}

function resetPlayerToSpawn() {
  const p = state.player;
  const s = map.emberSpawns[0];
  p.pos.x = s.x; p.pos.y = 0; p.pos.z = s.z;
  p.vel.x = 0; p.vel.y = 0; p.vel.z = 0;
  p.yaw = -Math.PI / 2;
  p.pitch = 0;
  p.health = 100;
  p.alive = true;
  p.recoil = 0;
  p.hurtT = 0;
  p.weapon = p.hasRifle ? 'rifle' : 'pistol';
}

function checkElimination() {
  if (state.phase !== 'live') return;
  const emberAlive = bots.aliveCount(TEAMS.EMBER) + (state.player.alive ? 1 : 0);
  const slagAlive = bots.aliveCount(TEAMS.SLAG);
  if (slagAlive === 0) endRound(TEAMS.EMBER, 'Slag team eliminated.');
  else if (emberAlive === 0) endRound(TEAMS.SLAG, 'Ember team eliminated.');
}

// ---- shop -----------------------------------------------------------------

function buyItem(item) {
  if (state.phase !== 'buy') return;
  const p = state.player;
  if (item === 'close') { hud.hideBuy(); if (!shot) input.requestLock(); return; }
  if (item === 'rifle' && !p.hasRifle && state.money >= WEAPONS.rifle.price) {
    state.money -= WEAPONS.rifle.price;
    p.hasRifle = true;
    p.arms.rifle.reserve = WEAPONS.rifle.reserveMax;
    p.arms.rifle.mag = WEAPONS.rifle.magSize;
    weapons.switchTo('rifle');
    audio.buy();
  } else if (item === 'pistol-ammo' && state.money >= WEAPONS.pistol.price) {
    state.money -= WEAPONS.pistol.price;
    p.arms.pistol.reserve = WEAPONS.pistol.reserveMax;
    audio.buy();
  } else if (item === 'grenade' && p.grenades < 2 && state.money >= GRENADE_PRICE) {
    state.money -= GRENADE_PRICE;
    p.grenades += 1;
    audio.buy();
  } else if (item === 'armor' && p.armor < 100 && state.money >= ARMOR_PRICE) {
    state.money -= ARMOR_PRICE;
    p.armor = 100;
    audio.buy();
  } else {
    return;
  }
  hud.setMoney(state.money);
  hud.refreshBuy();
  updateAmmoHud();
}

// ---- input callbacks ------------------------------------------------------

function onPlayPressed() {
  if (shot) return;
  audio.unlock();
  if (state.phase === 'menu' || state.phase === 'matchEnd') {
    startMatch();
    input.requestLock();
  } else {
    hud.hideOverlay();
    hud.hideEnd();
    input.requestLock();
  }
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (state.player.alive && state.phase === 'live') {
    hud.showOverlay('paused');
  } else if (state.player.alive && (state.phase === 'end' ||
      (state.phase === 'buy' && !hud.isBuyVisible()))) {
    // Lock lost between rounds with no buy menu on screen: the player has
    // no visible way back to a locked mouse, so offer one explicitly.
    // (During buy with the menu open, its Close button re-locks instead.)
    hud.showOverlay('resume');
  }
}

// Pointer lock was refused even after the delayed retry: mouse look and
// fire keep working by dragging, so hide the overlay that would block the
// view and say so — otherwise the fallback is unusable.
function onLockFailed() {
  if (shot) return;
  hud.hideOverlay();
  hud.showBanner('DRAG TO LOOK', 'Pointer lock was denied — hold the mouse button and drag to aim, click to fire.', 4);
}

// A click on the canvas itself re-locks the mouse — the recovery path when
// a round starts unlocked and no overlay is up to click instead.
function onCanvasClick() {
  if (shot) return;
  if ((state.phase === 'live' || state.phase === 'buy' || state.phase === 'end') &&
      (state.phase !== 'live' || state.player.alive)) {
    input.requestLock();
  }
}

function handleKeyDown(code) {
  if (shot) return;
  if (code === 'KeyM') { audio.toggleMute(); return; }
  if (state.phase === 'buy') {
    if (code === 'Digit1') buyItem('rifle');
    else if (code === 'Digit2') buyItem('pistol-ammo');
    else if (code === 'Digit3') buyItem('grenade');
    else if (code === 'Digit4') buyItem('armor');
    else if (code === 'KeyB') { hud.hideBuy(); input.requestLock(); }
  } else if (code === 'KeyB' && state.phase === 'buy') {
    hud.showBuy();
  }
  if (state.phase !== 'live') return;
  if (code === 'Digit1') weapons.switchTo('rifle');
  else if (code === 'Digit2') weapons.switchTo('pistol');
  else if (code === 'Digit3') weapons.switchTo('grenade');
  else if (code === 'KeyQ') weapons.cycle(1);
}

// ---- shooting --------------------------------------------------------------

const tmpDir = new THREE.Vector3();

function shootOnce() {
  const p = state.player;
  if (p.weapon === 'grenade') {
    camera.getWorldDirection(tmpDir);
    if (weapons.throwGrenade(tmpDir)) updateAmmoHud();
    return;
  }
  const def = weapons.def();
  if (!weapons.consumeRound()) {
    audio.dry();
    return;
  }
  camera.getWorldDirection(tmpDir);
  const spread = weapons.spreadNow();
  tmpDir.x += (state.random() * 2 - 1) * spread;
  tmpDir.y += (state.random() * 2 - 1) * spread;
  tmpDir.z += (state.random() * 2 - 1) * spread;
  tmpDir.normalize();
  scene.updateMatrixWorld(true);
  combat.playerShoot(camera, tmpDir, def, bots.botHitMeshes, map.shootables);
  if (p.weapon === 'rifle') audio.shot(0); else audio.pistolShot(0);
  state.noises.push({ x: p.pos.x, z: p.pos.z, radius: 26, ttl: 0.5 });
  player.recoil(def.recoilPitch + state.random() * 0.004, (state.random() * 2 - 1) * def.recoilYaw);
  updateAmmoHud();
}

function updateAmmoHud() {
  const p = state.player;
  if (p.weapon === 'grenade') {
    hud.setAmmo(p.grenades, 0, 'FRAG CHARGE');
    hud.setWeaponName('Frag Charge', p.grenades);
  } else {
    const arm = p.arms[p.weapon];
    const def = WEAPONS[p.weapon];
    hud.setAmmo(arm.mag, arm.reserve, def.name.toUpperCase());
    hud.setWeaponName(def.name, p.grenades);
  }
}

// ---- simulation step -------------------------------------------------------

let lastBeepAt = -99;
let plantBeepSec = -1;

function step(dt) {
  state.time += dt;
  const p = state.player;

  // Phase timers.
  if (state.phase === 'buy') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) startRound();
  } else if (state.phase === 'live') {
    state.phaseT -= dt;
    if (state.phaseT <= 0 && state.bomb.state !== 'planted') {
      endRound(TEAMS.SLAG, 'Time expired — the charge was never planted.');
    }
  } else if (state.phase === 'end') {
    state.phaseT -= dt;
    if (state.phaseT <= 0) {
      if (state.matchWinner >= 0) endMatch();
      else {
        state.round += 1;
        startBuyPhase();
      }
    }
  }

  if (state.phase === 'live' || state.phase === 'buy') {
    player.step(dt, input.keys, map.colliders, () => audio.step());
  }
  weapons.update(dt);
  // Bots act only once the round is live (or ending). During the buy phase
  // they hold at spawn — otherwise the round would be half-decided before
  // it starts, as an early test showed (3v1 by the first live second).
  if (state.phase === 'live' || state.phase === 'end') {
    bots.step(dt);
  }
  combat.grenadeStep(dt, map.colliders, bots.bots);
  combat.updateFx(dt);

  // Bomb: player planting, timer, detonation.
  const bomb = state.bomb;
  if (state.phase === 'live' && p.alive && bomb.state === 'carry' && bomb.holder === 'player') {
    const inSite = inRect(p.pos.x, p.pos.z, map.siteRect);
    if (inSite && input.keys.has('KeyE')) {
      bomb.plantT += dt / PLANT_TIME;
      const sec = Math.floor(bomb.plantT * PLANT_TIME);
      if (sec !== plantBeepSec) { plantBeepSec = sec; audio.beep(false); }
      if (bomb.plantT >= 1) {
        bomb.state = 'planted';
        bomb.timer = BOMB_TIME;
        bomb.x = p.pos.x;
        bomb.z = p.pos.z;
        state.money += PLANT_REWARD;
        hud.setMoney(state.money);
        hud.addFeed('You planted the charge  +$' + PLANT_REWARD, 0);
        hud.showBanner('BOMB PLANTED', 'Hold the Furnace for 35 seconds.', 3);
        audio.plantDone();
      }
    } else {
      bomb.plantT = Math.max(0, bomb.plantT - dt);
      plantBeepSec = -1;
    }
  }
  if (bomb.state === 'planted') {
    bomb.timer -= dt;
    const interval = bomb.timer > 10 ? 1 : 0.5;
    if (state.time - lastBeepAt >= interval) {
      lastBeepAt = state.time;
      audio.beep(bomb.timer <= 10);
    }
    if (bomb.timer <= 0) {
      combat.explode({ x: bomb.x, y: 0.6, z: bomb.z, fromPlayer: true }, bots.bots);
      bomb.state = 'exploded';
      endRound(TEAMS.EMBER, 'The charge detonated at the Furnace.');
    }
  }
  if (bomb.state === 'defused') {
    // Defuse completion is reported by the bot that did it (endRound there).
    bomb.state = 'carry';
  }

  // Noise decay.
  for (let i = state.noises.length - 1; i >= 0; i--) {
    state.noises[i].ttl -= dt;
    if (state.noises[i].ttl <= 0) state.noises.splice(i, 1);
  }
  if (p.hurtT > 0) p.hurtT -= dt;
  if (p.hurtT <= 0) p.hurtT = 0;

  // Furnace light flicker.
  map.furnaceLight.intensity = 55 + Math.sin(state.time * 7.3) * 6 + Math.sin(state.time * 13.7) * 4;
}

// ---- HUD refresh -----------------------------------------------------------

function refreshHud() {
  const p = state.player;
  hud.setHealth(p.health, p.armor);
  hud.setTimer(state.phase === 'live' || state.phase === 'buy' ? state.phaseT : 0);
  hud.setAlive(
    bots.aliveCount(TEAMS.EMBER) + (p.alive ? 1 : 0),
    bots.aliveCount(TEAMS.SLAG),
  );
  hud.setCrosshair(state.phase === 'live' && p.alive ? weapons.spreadNow() : 0.008);
  // Bomb status line.
  const bomb = state.bomb;
  if (state.phase === 'live') {
    if (bomb.state === 'planted') {
      hud.setBombStatus('BOMB PLANTED — ' + Math.ceil(bomb.timer) + 's');
    } else if (bomb.state === 'carry' && bomb.holder === 'player') {
      hud.setBombStatus(bomb.plantT > 0
        ? 'PLANTING… ' + Math.round(bomb.plantT * 100) + '%'
        : 'BOMB — carry it to the Furnace (Site A)');
    } else if (bomb.state === 'carry') {
      const carrier = bots.bots.find((b) => b.id === bomb.holder);
      hud.setBombStatus(carrier ? 'BOMB — with ' + carrier.name : 'BOMB — with your squad');
    } else {
      hud.setBombStatus('');
    }
    const inSite = inRect(p.pos.x, p.pos.z, map.siteRect);
    if (p.alive && bomb.state === 'carry' && bomb.holder === 'player' && inSite) {
      hud.setHint('Hold E to plant the charge');
    } else {
      hud.setHint('');
    }
  } else {
    hud.setBombStatus('');
    hud.setHint('');
  }
}

// ---- main loop --------------------------------------------------------------

let lastTime = performance.now();
let accumulator = 0;
let frozen = false;
let semiUsed = false;
let prevReloadKey = false;

function syncCamera() {
  const p = state.player;
  camera.position.set(p.pos.x, p.pos.y + p.eye, p.pos.z);
  camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (frozen) {
    renderer.render(scene, camera);
    return;
  }

  const look = input.takeLook();
  if (look.x || look.y) player.look(look.x, look.y);
  const wheel = input.takeWheel();
  if (wheel !== 0 && state.phase === 'live') weapons.cycle(wheel > 0 ? 1 : -1);

  // Edge-triggered keys.
  const rHeld = input.keys.has('KeyR');
  if (rHeld && !prevReloadKey && state.phase === 'live') weapons.startReload();
  prevReloadKey = rHeld;

  // Firing (render-rate input, sim-rate state). Drag-to-look mode counts
  // as locked here: the fallback is only engaged when the real lock failed,
  // and without this the drag fallback could aim but never fire.
  if (state.phase === 'live' && state.player.alive && (input.locked || input.dragMode || shot)) {
    if (input.firing) {
      const def = weapons.def();
      const auto = state.player.weapon === 'grenade' || (def && def.auto);
      if (!semiUsed && weapons.canFire()) {
        shootOnce();
        if (!auto) semiUsed = true;
      }
    } else {
      semiUsed = false;
    }
  } else {
    semiUsed = false;
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;

  syncCamera();
  refreshHud();
  hud.tick(dt);
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- photo mode -------------------------------------------------------------

function settle(steps) {
  for (let i = 0; i < steps; i++) step(FIXED_STEP);
}

function aimAt(x, y, z) {
  const p = state.player;
  const dx = x - p.pos.x;
  const dy = y - (p.pos.y + p.eye);
  const dz = z - p.pos.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = Math.asin(clamp(dy / len, -1, 1));
  syncCamera();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    refreshHud();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(n) {
  hud.hideOverlay();
  // Photo setups must not be interrupted: bots stop acquiring targets and
  // the player is restored to full health once positioned.
  function freezeBots() {
    for (const b of bots.bots) {
      b.target = null;
      b.visionT = 99;
      if (b.alive) { b.hp = 100; }
    }
    state.player.health = 100;
    state.player.alive = true;
  }
  if (n === 1) {
    // Buy phase at the Ember spawn, squad ahead, shop open.
    startMatch();
    state.player.pos.x = -20; state.player.pos.z = 0;
    state.player.yaw = -Math.PI / 2;
    settle(30);
    aimAt(0, 1.4, 0);
    hud.showBuy();
    hud.refreshBuy();
  } else if (n === 2) {
    // Mid-round firefight on Crane Row.
    startMatch();
    startRound();
    settle(60);
    state.player.pos.x = -4; state.player.pos.z = 2;
    state.player.yaw = -Math.PI / 2;
    const e1 = bots.bots[4];
    const e2 = bots.bots[5];
    e1.group.position.set(3, 0, -1);
    e1.yaw = Math.PI / 2;
    e1.state = 'hold';
    e2.group.position.set(5.5, 0, 2.5);
    e2.yaw = Math.PI / 2;
    e2.state = 'hold';
    freezeBots();
    settle(10);
    aimAt(3, 1.55, -1); // head height: the shot lands a headshot kill
    shootOnce();
    settle(20); // let the hit bot fall
    aimAt(3, 1.4, -1);
  } else if (n === 3) {
    // The Furnace site: a teammate planting while the bomb beeps.
    startMatch();
    startRound();
    settle(60);
    state.player.pos.x = 5; state.player.pos.z = -4.5;
    const planter = bots.bots[0];
    planter.group.position.set(12.5, 0, -1);
    planter.yaw = -Math.PI / 2;
    planter.state = 'plant';
    state.bomb.state = 'planted';
    state.bomb.timer = 22;
    state.bomb.x = 12.5;
    state.bomb.z = -1;
    freezeBots();
    settle(10);
    aimAt(12.5, 2.0, -0.5); // aim high so the sign drops below the banner
    hud.showBanner('BOMB PLANTED', 'Hold the Furnace for 35 seconds.', 30);
  } else {
    // Round end: Ember takes the round at the site.
    startMatch();
    startRound();
    state.score = [3, 2];
    settle(60);
    state.player.pos.x = 5; state.player.pos.z = 4.5;
    const dead = bots.bots[4];
    dead.alive = false;
    dead.group.position.set(10.5, 0, -1);
    dead.group.rotation.x = -Math.PI / 2;
    freezeBots();
    dead.alive = false;
    dead.group.rotation.x = -Math.PI / 2;
    settle(10);
    aimAt(12, 2.0, 0); // aim high so the sign drops below the banner
    hud.setScore();
    hud.showBanner('EMBER WINS THE ROUND', 'Slag team eliminated.  +$3250', 30);
  }
  refreshHud();
  paintTwiceThenReady();
}

// ---- boot -------------------------------------------------------------------

syncCamera();
bots.spawnRound();
weapons.initArms();
hud.setScore();
hud.setMoney(state.money);
hud.setHealth(100, 0);
hud.setAmmo(12, 48, 'P9 SIDEARM');
if (shot >= 1 && shot <= 4) {
  runShot(shot);
} else {
  hud.showOverlay('start');
  requestAnimationFrame(frame);
}
