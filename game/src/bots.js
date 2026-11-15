// bots.js — the nine bots. Each one walks a waypoint graph (BFS routes), holds
// a post, scans for enemies, reacts to gunfire it hears, and plants or defuses
// the bomb. Shooting is resolved per-shot with a hit probability that falls
// with distance, target speed and the shooter's own movement — the same
// "stopping to aim pays" rule the player lives under.
import * as THREE from 'three';
import { TEAM_COLOR, TEAMS } from './state.js';
import { segmentBlocked, angleDiff, clamp } from './util.js';
import { moveCircle, inRect } from './collision.js';

const EMBER_NAMES = ['Ash', 'Cinder', 'Flint', 'Soot'];
const SLAG_NAMES = ['Vex', 'Marrow', 'Rust', 'Tallow', 'Grit'];
const BOT_SPEED = 3.4;
const BOT_ENGAGE_SPEED = 2.2;
const VISION_RANGE = 26; // shorter than any spawn-to-hold sightline
const VISION_FOV = 1.9; // ~109 degrees
const REACT_TIME = 0.35;
const RIFLE_DMG = 30;

function nearestWp(waypoints, x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < waypoints.length; i++) {
    const dx = waypoints[i].x - x;
    const dz = waypoints[i].z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

function findPath(waypoints, from, to) {
  if (from === to) return [to];
  const prev = new Array(waypoints.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const n of waypoints[cur].edges) {
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      if (n === to) {
        const path = [to];
        let c = to;
        while (c !== from) { c = prev[c]; path.push(c); }
        path.reverse();
        return path;
      }
      queue.push(n);
    }
  }
  return [to];
}

function buildBotMesh(team) {
  const group = new THREE.Group();
  const color = TEAM_COLOR[team];
  const suit = new THREE.MeshStandardMaterial({ color: 0x2e3236, roughness: 0.85, metalness: 0.2 });
  const accent = new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.9 });
  const box = (w, h, d, mat, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  box(0.16, 0.7, 0.18, dark, -0.12, 0.35, 0);   // legs
  box(0.16, 0.7, 0.18, dark, 0.12, 0.35, 0);
  const torso = box(0.52, 0.62, 0.3, suit, 0, 1.02, 0);
  box(0.54, 0.14, 0.32, accent, 0, 1.28, 0);     // chest band, team color
  const head = box(0.3, 0.3, 0.3, suit, 0, 1.55, 0);
  box(0.26, 0.1, 0.06, dark, 0, 1.57, -0.16);    // visor, facing forward (-z)
  box(0.12, 0.12, 0.3, accent, 0, 1.72, 0);      // helmet light
  const gun = box(0.07, 0.1, 0.7, dark, 0.2, 1.15, -0.3);
  box(0.1, 0.34, 0.12, suit, 0.2, 1.05, 0.05);   // arm to gun
  group.traverse((m) => { if (m.isMesh) m.userData.solid = false; });
  return { group, torso, head, gun };
}

export function createBots(state, scene, map, combat, hooks) {
  const bots = [];
  const botHitMeshes = [];
  const tmpFrom = new THREE.Vector3();
  const tmpTo = new THREE.Vector3();

  function makeBot(id, team, name) {
    const { group, torso, head } = buildBotMesh(team);
    torso.userData.bot = null; // set below once the record exists
    head.userData.bot = null;
    scene.add(group);
    const bot = {
      id, team, name, group,
      hp: 100, alive: true,
      yaw: 0, speed: 0,
      state: 'route',           // route | hold | engage | investigate | plant | defuse
      path: [], pathIdx: 0,
      holdWp: -1,
      target: null,             // bot record or the string 'player'
      lastSeen: { x: 0, z: 0, t: -99 },
      reactT: 0,
      fireT: 0, burstLeft: 0, burstPause: 0,
      visionT: Math.random() * 0.12,
      strafeDir: 1, strafeT: 0,
      investigate: null,        // {x, z, t}
      scanYaw: 0,
      flashT: 0,
      deathT: 0,
      walkT: 0,
    };
    torso.userData.bot = bot;
    torso.userData.part = 'body';
    head.userData.bot = bot;
    head.userData.part = 'head';
    botHitMeshes.push(torso, head);
    return bot;
  }

  for (let i = 0; i < 4; i++) bots.push(makeBot(i, TEAMS.EMBER, EMBER_NAMES[i]));
  for (let i = 0; i < 5; i++) bots.push(makeBot(4 + i, TEAMS.SLAG, SLAG_NAMES[i]));
  state.bots = bots;

  function aliveCount(team) {
    let n = 0;
    for (const b of bots) if (b.team === team && b.alive) n++;
    return n;
  }

  function setPath(bot, toWp) {
    const from = nearestWp(map.waypoints, bot.group.position.x, bot.group.position.z);
    bot.path = findPath(map.waypoints, from, toWp);
    bot.pathIdx = 0;
  }

  function spawnRound() {
    const rand = state.random;
    for (const bot of bots) {
      bot.hp = 100;
      bot.alive = true;
      bot.group.rotation.set(0, 0, 0);
      bot.group.visible = true;
      bot.target = null;
      bot.investigate = null;
      bot.flashT = 0;
      bot.state = 'route';
      if (bot.team === TEAMS.EMBER) {
        const s = map.emberSpawns[bot.id];
        bot.group.position.set(s.x, 0, s.z);
        bot.yaw = -Math.PI / 2; // face east, toward the site
        // Pick a lane: north 30%, mid 40%, south 30%.
        const r = rand();
        const laneWp = r < 0.3 ? 23 : r < 0.7 ? 22 : 24;
        const via = laneWp === 23 ? [9, 14, 17, 20, 23] : laneWp === 22 ? [8, 13, 16, 19, 22] : [10, 15, 18, 21, 24];
        setPath(bot, via[0]);
        bot.lane = via;
        bot.laneIdx = 0;
      } else {
        const s = map.slagSpawns[bot.id - 4];
        bot.group.position.set(s.x, 0, s.z);
        bot.yaw = Math.PI / 2; // face west
        bot.holdWp = map.defendHolds[(bot.id - 4) % map.defendHolds.length];
        setPath(bot, bot.holdWp);
        bot.lane = null;
      }
      bot.group.rotation.y = bot.yaw;
    }
    // The bomb starts with the player; a dead carrier hands it to a teammate.
    state.bomb.state = 'carry';
    state.bomb.holder = 'player';
    state.bomb.plantT = 0;
    state.bomb.defuseT = 0;
    state.bomb.timer = 0;
  }

  function canSee(bot, tx, tz) {
    const dx = tx - bot.group.position.x;
    const dz = tz - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist > VISION_RANGE) return 0;
    const ang = Math.atan2(-dx, -dz);
    let diff = angleDiff(ang, bot.yaw);
    if (Math.abs(diff) > VISION_FOV / 2 && dist > 6) return 0;
    if (segmentBlocked(bot.group.position.x, bot.group.position.z, tx, tz, map.colliders, 1.5)) return 0;
    return dist;
  }

  function scanForEnemy(bot) {
    // Returns {target, dist} for the nearest visible enemy, or null.
    let best = null;
    let bestD = Infinity;
    // The player fights for Ember, so only Slag bots treat them as a target.
    // (Without the team check, Ember teammates shot their own player.)
    const p = state.player;
    if (p.alive && bot.team === TEAMS.SLAG) {
      const d = canSee(bot, p.pos.x, p.pos.z);
      const range = p.crouched ? VISION_RANGE * 0.8 : VISION_RANGE;
      if (d > 0 && d < range && d < bestD) { bestD = d; best = 'player'; }
    }
    for (const other of bots) {
      if (other.team === bot.team || !other.alive) continue;
      const d = canSee(bot, other.group.position.x, other.group.position.z);
      if (d > 0 && d < bestD) { bestD = d; best = other; }
    }
    return best ? { target: best, dist: bestD } : null;
  }

  function targetPos(bot) {
    if (bot.target === 'player') {
      const p = state.player;
      return { x: p.pos.x, z: p.pos.z, y: p.pos.y + (p.crouched ? 1.0 : 1.4), speed: p.speed2d };
    }
    return {
      x: bot.target.group.position.x, z: bot.target.group.position.z,
      y: 1.4, speed: bot.target.speed || 0,
    };
  }

  function shootAt(bot, dt) {
    bot.fireT -= dt;
    if (bot.burstLeft > 0) {
      if (bot.fireT > 0) return;
      bot.fireT = 0.12;
      bot.burstLeft -= 1;
      const tp = targetPos(bot);
      const dist = Math.hypot(tp.x - bot.group.position.x, tp.z - bot.group.position.z);
      const pHit = clamp(0.5 - dist * 0.011 - tp.speed * 0.035 - bot.speed * 0.04, 0.04, 0.55);
      // Tracer from the bot's gun toward the target.
      tmpFrom.set(bot.group.position.x, 1.35, bot.group.position.z);
      tmpTo.set(tp.x, tp.y, tp.z);
      hooks.tracer(tmpFrom, tmpTo);
      hooks.shotSound(dist);
      if (state.random() < pHit) {
        const isHead = state.random() < 0.12;
        const dmg = RIFLE_DMG * (isHead ? 3.5 : 1);
        if (bot.target === 'player') {
          combat.damagePlayer(dmg, Math.atan2(tp.x - bot.group.position.x, tp.z - bot.group.position.z));
        } else {
          combat.damageBot(bot.target, dmg, isHead, 'bot');
        }
      }
      if (bot.burstLeft === 0) bot.burstPause = 0.5 + state.random() * 0.5;
    } else {
      bot.burstPause -= dt;
      if (bot.burstPause <= 0) {
        bot.burstLeft = 3 + ((state.random() * 3) | 0);
        bot.fireT = 0;
      }
    }
  }

  function moveToward(bot, tx, tz, speed, dt) {
    const dx = tx - bot.group.position.x;
    const dz = tz - bot.group.position.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) return true;
    const stepLen = Math.min(dist, speed * dt);
    const nx = (dx / dist) * stepLen;
    const nz = (dz / dist) * stepLen;
    moveCircle(bot.group.position, nx, nz, 0.35, 0, map.colliders);
    bot.speed = speed;
    bot.walkT += dt * speed;
    const targetYaw = Math.atan2(-dx, -dz);
    bot.yaw += angleDiff(targetYaw, bot.yaw) * Math.min(1, dt * 8);
    return dist <= 0.6;
  }

  function facePoint(bot, x, z, dt) {
    const dx = x - bot.group.position.x;
    const dz = z - bot.group.position.z;
    const targetYaw = Math.atan2(-dx, -dz);
    bot.yaw += angleDiff(targetYaw, bot.yaw) * Math.min(1, dt * 10);
  }

  function stepBot(bot, dt) {
    if (!bot.alive) {
      // Fall over once, then lie still until the round resets.
      if (bot.deathT < 0.35) {
        bot.deathT += dt;
        bot.group.rotation.x = -Math.PI / 2 * Math.min(1, bot.deathT / 0.35);
      }
      return;
    }
    if (bot.flashT > 0) bot.flashT -= dt;

    // Bomb hand-off: a dead player carrier passes the bomb to a live teammate.
    if (state.bomb.state === 'carry' && state.bomb.holder === 'player' && !state.player.alive) {
      const alive = bots.filter((b) => b.team === TEAMS.EMBER && b.alive);
      if (alive.length > 0) {
        state.bomb.holder = alive[(state.random() * alive.length) | 0].id;
        hooks.addFeed('Bomb passed to ' + alive.find((b) => b.id === state.bomb.holder).name, TEAMS.EMBER);
      }
    }

    // Vision, staggered so not every bot raycasts every step.
    bot.visionT -= dt;
    if (bot.visionT <= 0) {
      bot.visionT = 0.12 + state.random() * 0.05;
      const seen = scanForEnemy(bot);
      if (seen) {
        if (bot.target !== seen.target) bot.reactT = REACT_TIME;
        bot.target = seen.target;
        bot.lastSeen.x = seen.target === 'player' ? state.player.pos.x : seen.target.group.position.x;
        bot.lastSeen.z = seen.target === 'player' ? state.player.pos.z : seen.target.group.position.z;
        bot.lastSeen.t = state.time;
        bot.state = 'engage';
      } else if (bot.target && state.time - bot.lastSeen.t > 2.5) {
        bot.target = null;
        bot.state = bot.team === TEAMS.SLAG && bot.holdWp >= 0 ? 'hold' : 'route';
      }
    }

    // Hearing: a nearby gunshot pulls a bot to investigate.
    if (!bot.target) {
      for (const n of state.noises) {
        const d = Math.hypot(n.x - bot.group.position.x, n.z - bot.group.position.z);
        if (d < n.radius) {
          bot.investigate = { x: n.x, z: n.z, t: 3 };
          setPath(bot, nearestWp(map.waypoints, n.x, n.z));
          bot.state = 'investigate';
          break;
        }
      }
    }

    // Bomb logic for the carrier and for defusers.
    const bomb = state.bomb;
    if (bot.team === TEAMS.EMBER && bomb.state === 'carry' && bomb.holder === bot.id) {
      const inSite = inRect(bot.group.position.x, bot.group.position.z, map.siteRect);
      if (inSite && !bot.target) {
        bot.state = 'plant';
        bomb.plantT += dt / 3;
        if (Math.floor(bomb.plantT * 3) !== Math.floor((bomb.plantT - dt / 3) * 3)) hooks.beep(false);
        if (bomb.plantT >= 1) {
          bomb.state = 'planted';
          bomb.timer = 35;
          bomb.x = bot.group.position.x;
          bomb.z = bot.group.position.z;
          bomb.planter = null;
          hooks.plantDone(bot.name);
          bot.state = 'route';
        }
      } else if (bot.state === 'plant') {
        bomb.plantT = 0;
        bot.state = 'route';
      }
    }
    if (bot.team === TEAMS.SLAG && bomb.state === 'planted') {
      const d = Math.hypot(bomb.x - bot.group.position.x, bomb.z - bot.group.position.z);
      if (d < 1.6 && !bot.target) {
        bot.state = 'defuse';
        bomb.defuseT += dt / 5;
        if (Math.floor(bomb.defuseT * 5) !== Math.floor((bomb.defuseT - dt / 5) * 5)) hooks.beep(false);
        if (bomb.defuseT >= 1) {
          bomb.state = 'defused';
          hooks.defuseDone(bot.name);
        }
      } else if (bot.state === 'defuse') {
        bomb.defuseT = 0;
      }
    }

    // Movement by state.
    bot.speed = 0;
    if (bot.state === 'engage' && bot.target) {
      bot.reactT -= dt;
      const tp = targetPos(bot);
      facePoint(bot, tp.x, tp.z, dt);
      if (bot.reactT <= 0) shootAt(bot, dt);
      // Close the distance if far, strafe if close.
      const dist = Math.hypot(tp.x - bot.group.position.x, tp.z - bot.group.position.z);
      if (dist > 16) {
        moveToward(bot, tp.x, tp.z, BOT_ENGAGE_SPEED, dt);
      } else {
        bot.strafeT -= dt;
        if (bot.strafeT <= 0) {
          bot.strafeDir = state.random() < 0.5 ? -1 : 1;
          bot.strafeT = 0.7 + state.random() * 0.8;
        }
        const fx = -Math.sin(bot.yaw);
        const fz = -Math.cos(bot.yaw);
        const sx = -fz * bot.strafeDir;
        const sz = fx * bot.strafeDir;
        moveCircle(bot.group.position, sx * BOT_ENGAGE_SPEED * 0.6 * dt, sz * BOT_ENGAGE_SPEED * 0.6 * dt, 0.35, 0, map.colliders);
        bot.speed = BOT_ENGAGE_SPEED * 0.6;
      }
    } else if (bot.state === 'plant' || bot.state === 'defuse') {
      // Standing still, working the bomb.
    } else if (bot.state === 'hold') {
      // Scan: slow yaw sweep.
      bot.scanYaw += dt * 0.5;
      bot.yaw += Math.sin(bot.scanYaw) * dt * 0.4;
      // If the bomb is planted, leave the post and go defuse.
      if (bomb.state === 'planted' && bot.team === TEAMS.SLAG) {
        setPath(bot, nearestWp(map.waypoints, bomb.x, bomb.z));
        bot.state = 'route';
      }
    } else {
      // route / investigate: walk the path.
      if (bot.pathIdx < bot.path.length) {
        const wp = map.waypoints[bot.path[bot.pathIdx]];
        if (moveToward(bot, wp.x, wp.z, BOT_SPEED, dt)) bot.pathIdx += 1;
      } else {
        if (bot.state === 'investigate') {
          bot.investigate.t -= dt;
          bot.yaw += dt * 1.2; // look around
          if (bot.investigate.t <= 0) {
            bot.investigate = null;
            bot.state = 'route';
            if (bot.team === TEAMS.SLAG) setPath(bot, bot.holdWp);
            else if (bot.lane) { setPath(bot, bot.lane[bot.laneIdx]); }
          }
        } else if (bot.team === TEAMS.SLAG) {
          bot.state = 'hold';
        } else if (bot.team === TEAMS.EMBER && bot.lane) {
          // Advance along the chosen lane toward the site.
          if (bot.laneIdx < bot.lane.length - 1) {
            bot.laneIdx += 1;
            setPath(bot, bot.lane[bot.laneIdx]);
          } else {
            setPath(bot, 30); // site center
            bot.state = 'route';
            bot.lane = null;
          }
        } else if (bot.team === TEAMS.EMBER && bomb.state === 'planted') {
          // After the plant, fall back and guard the bomb from a distance.
          setPath(bot, nearestWp(map.waypoints, bot.group.position.x + 4, bot.group.position.z));
          bot.state = 'hold';
        }
      }
    }

    // Walk-cycle bob and facing.
    bot.group.rotation.y = bot.yaw;
    if (bot.speed > 0) {
      bot.group.position.y = Math.abs(Math.sin(bot.walkT * 2.4)) * 0.04;
    } else {
      bot.group.position.y = 0;
    }

    // Separation: bots never stack on each other.
    for (const other of bots) {
      if (other === bot || !other.alive) continue;
      const dx = bot.group.position.x - other.group.position.x;
      const dz = bot.group.position.z - other.group.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 0.49 && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (0.7 - d) * 0.5;
        bot.group.position.x += (dx / d) * push;
        bot.group.position.z += (dz / d) * push;
      }
    }
  }

  function step(dt) {
    for (const bot of bots) stepBot(bot, dt);
  }

  return { bots, botHitMeshes, spawnRound, step, aliveCount };
}
