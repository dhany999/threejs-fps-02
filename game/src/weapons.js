// weapons.js — the arsenal: rifle, pistol and frag charge. Owns ammo, fire
// cadence, reload timing, spread math and the first-person viewmodel.
// Damage resolution lives in combat.js; this module only decides whether a
// shot may leave the barrel and what it costs.
import * as THREE from 'three';
import { WEAPONS, GRENADE_PRICE } from './state.js';
import { clamp } from './util.js';

function buildGunMesh(long) {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.55, metalness: 0.7 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xe8722a, roughness: 0.5, metalness: 0.4 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x1a1c1e, roughness: 0.9, metalness: 0.1 });
  const bodyLen = long ? 0.62 : 0.34;
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, bodyLen), metal);
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, long ? 0.34 : 0.14, 8), metal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -(bodyLen / 2 + (long ? 0.15 : 0.05)));
  g.add(barrel);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), grip);
  mag.position.set(0, -0.14, long ? 0.08 : 0.02);
  mag.rotation.x = 0.25;
  g.add(mag);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.08), accent);
  sight.position.set(0, 0.09, long ? -0.05 : -0.02);
  g.add(sight);
  if (long) {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.18), grip);
    stock.position.set(0, -0.01, 0.38);
    g.add(stock);
  }
  return g;
}

export function createWeapons(state, camera, audio) {
  const p = state.player;
  const group = new THREE.Group();
  camera.add(group);

  const rifleMesh = buildGunMesh(true);
  const pistolMesh = buildGunMesh(false);
  const grenadeMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.07, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0x3d5a3a, roughness: 0.7, metalness: 0.4 }),
  );
  group.add(rifleMesh);
  group.add(pistolMesh);
  group.add(grenadeMesh);

  // Muzzle flash: a bright quad + light at the barrel tip, shown for ~40 ms.
  const flashMat = new THREE.MeshBasicMaterial({ color: 0xffc266, transparent: true, opacity: 0 });
  const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), flashMat);
  flash.position.set(0, 0.02, -0.85);
  group.add(flash);
  const flashLight = new THREE.PointLight(0xffa040, 0, 6, 2);
  flashLight.position.set(0, 0.05, -0.7);
  group.add(flashLight);

  group.position.set(0.28, -0.26, -0.45);
  let bobT = 0;
  let kick = 0;
  let flashT = 0;

  function def() { return WEAPONS[p.weapon === 'grenade' ? 'pistol' : p.weapon]; }

  function initArms() {
    for (const id of ['rifle', 'pistol']) {
      const d = WEAPONS[id];
      p.arms[id] = {
        mag: d.magSize,
        reserve: id === 'pistol' ? d.reserveMax : (p.hasRifle ? d.reserveMax : 0),
        cooldown: 0,
        reloading: false,
        reloadT: 0,
      };
    }
    p.weapon = p.hasRifle ? 'rifle' : 'pistol';
    p.grenades = p.grenades || 0;
  }

  function current() {
    return p.weapon === 'grenade' ? null : p.arms[p.weapon];
  }

  function canFire() {
    if (p.weapon === 'grenade') return p.grenades > 0;
    const arm = current();
    return arm && arm.cooldown <= 0 && !arm.reloading && arm.mag > 0;
  }

  // Spread in radians: base, plus movement, plus air, plus recoil bloom.
  // Standing still and aiming is rewarded; sprinting and spraying is not.
  function spreadNow() {
    const d = def();
    const move = clamp(p.speed2d / 4.3, 0, 1);
    const air = p.onGround ? 0 : 0.02;
    return d.baseSpread + move * d.moveSpread + air + p.recoil * 0.35;
  }

  function consumeRound() {
    const arm = current();
    if (!arm) return false;
    arm.mag -= 1;
    arm.cooldown = def().fireInterval;
    kick = 0.09;
    flashT = 0.045;
    flashMat.opacity = 0.95;
    flashLight.intensity = 14;
    return true;
  }

  function startReload() {
    const arm = current();
    if (!arm || arm.reloading || arm.mag >= def().magSize || arm.reserve <= 0) return false;
    arm.reloading = true;
    arm.reloadT = def().reloadTime;
    audio.reload();
    return true;
  }

  function switchTo(id) {
    if (id === 'rifle' && !p.hasRifle) return false;
    if (id === 'grenade' && p.grenades <= 0) return false;
    if (id !== 'rifle' && id !== 'pistol' && id !== 'grenade') return false;
    if (p.weapon === id) return false;
    const arm = current();
    if (arm) arm.reloading = false;
    p.weapon = id;
    return true;
  }

  function cycle(dir) {
    const order = ['rifle', 'pistol', 'grenade'].filter((id) =>
      (id === 'rifle' ? p.hasRifle : id === 'pistol' ? true : p.grenades > 0));
    if (order.length < 2) return;
    const i = order.indexOf(p.weapon);
    switchTo(order[(i + dir + order.length) % order.length]);
  }

  // Throw a grenade from the camera with an upward arc. Returns the grenade
  // record or null when none is carried.
  function throwGrenade(dir) {
    if (p.grenades <= 0) return null;
    p.grenades -= 1;
    audio.grenadePin();
    const g = {
      x: p.pos.x, y: p.pos.y + p.eye, z: p.pos.z,
      vx: dir.x * 13, vy: dir.y * 13 + 2.5, vz: dir.z * 13,
      fuse: 1.6, fromPlayer: true,
    };
    state.grenades.push(g);
    return g;
  }

  function update(dt) {
    for (const id of ['rifle', 'pistol']) {
      const arm = p.arms[id];
      if (!arm) continue;
      if (arm.cooldown > 0) arm.cooldown -= dt;
      if (arm.reloading) {
        arm.reloadT -= dt;
        if (arm.reloadT <= 0) {
          arm.reloading = false;
          const d = WEAPONS[id];
          const need = d.magSize - arm.mag;
          const take = Math.min(need, arm.reserve);
          arm.mag += take;
          arm.reserve -= take;
        }
      }
    }
    // Viewmodel motion: walk bob, reload dip, recoil kick.
    bobT += dt * (2 + p.speed2d * 2.2);
    const bobA = clamp(p.speed2d / 4.3, 0, 1) * 0.014;
    kick = Math.max(0, kick - dt * 0.55);
    const reloading = current() && current().reloading;
    const dip = reloading ? Math.sin(Math.min(1, 1 - current().reloadT / def().reloadTime) * Math.PI) * 0.12 : 0;
    group.position.set(
      0.28 + Math.sin(bobT) * bobA,
      -0.26 + Math.abs(Math.cos(bobT)) * bobA - dip,
      -0.45 + kick,
    );
    group.rotation.x = kick * 1.4 + dip * 1.2;
    rifleMesh.visible = p.weapon === 'rifle';
    pistolMesh.visible = p.weapon === 'pistol';
    grenadeMesh.visible = p.weapon === 'grenade';
    if (flashT > 0) {
      flashT -= dt;
      if (flashT <= 0) {
        flashMat.opacity = 0;
        flashLight.intensity = 0;
      }
    }
  }

  return {
    initArms, current, canFire, spreadNow, consumeRound,
    startReload, switchTo, cycle, throwGrenade, update, def,
  };
}

export { GRENADE_PRICE };
