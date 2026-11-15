// combat.js — damage resolution. Player shots are raycast against bot
// head/body boxes and the map (nearest hit wins, headshots multiply damage);
// grenades are simulated spheres that bounce and explode. Bot fire is
// resolved probabilistically in bots.js and lands through damagePlayer here,
// so armor and death flow through one place.
import * as THREE from 'three';

const TRACER_POOL = 14;
const GRENADE_RADIUS = 7;
const GRENADE_MAX_DMG = 120;

export function createCombat(state, scene, hooks) {
  const raycaster = new THREE.Raycaster();
  const tmpDir = new THREE.Vector3();
  const tmpOrigin = new THREE.Vector3();
  const tmpMuzzle = new THREE.Vector3();
  const tmpHit = new THREE.Vector3();

  // Tracer pool: pre-built lines, recycled, never allocated per shot.
  const tracers = [];
  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffc266, transparent: true, opacity: 0.9 });
  for (let i = 0; i < TRACER_POOL; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracers.push({ line, life: 0 });
  }
  let tracerIdx = 0;

  // Explosion flash: one reusable sphere + light.
  const boomGeo = new THREE.SphereGeometry(1, 12, 10);
  const boomMat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0 });
  const boom = new THREE.Mesh(boomGeo, boomMat);
  boom.visible = false;
  scene.add(boom);
  const boomLight = new THREE.PointLight(0xff7a20, 0, 18, 1.6);
  scene.add(boomLight);
  let boomT = 0;

  function spawnTracer(from, to) {
    const t = tracers[tracerIdx];
    tracerIdx = (tracerIdx + 1) % TRACER_POOL;
    const pos = t.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    t.line.visible = true;
    t.life = 0.07;
  }

  function updateFx(dt) {
    for (const t of tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.line.visible = false;
      }
    }
    if (boomT > 0) {
      boomT -= dt;
      const k = Math.max(0, boomT / 0.45);
      boom.scale.setScalar(1 + (1 - k) * 6);
      boomMat.opacity = k * 0.75;
      boomLight.intensity = k * 90;
      if (boomT <= 0) {
        boom.visible = false;
        boomLight.intensity = 0;
      }
    }
  }

  // Fire one player shot. `dir` is the camera forward with spread applied.
  // Returns 'head' | 'body' | 'wall' | 'none'.
  function playerShoot(camera, dir, weaponDef, botHitMeshes, shootables) {
    camera.getWorldPosition(tmpOrigin);
    tmpMuzzle.copy(tmpOrigin);
    // Muzzle sits a little forward and down from the camera.
    camera.getWorldDirection(tmpDir);
    tmpMuzzle.addScaledVector(tmpDir, 0.5);
    tmpMuzzle.y -= 0.18;
    raycaster.set(tmpOrigin, dir);
    raycaster.far = weaponDef.range;
    const targets = shootables.concat(botHitMeshes);
    const hits = raycaster.intersectObjects(targets, false);
    const end = tmpHit;
    if (hits.length === 0) {
      end.copy(tmpOrigin).addScaledVector(dir, weaponDef.range);
      spawnTracer(tmpMuzzle, end);
      return 'none';
    }
    const hit = hits[0];
    end.copy(hit.point);
    spawnTracer(tmpMuzzle, end);
    const ud = hit.object.userData;
    if (ud.bot && ud.bot.alive) {
      const isHead = ud.part === 'head';
      const dmg = weaponDef.damage * (isHead ? weaponDef.headMult : 1);
      damageBot(ud.bot, dmg, isHead, 'player');
      hooks.onHit(isHead);
      return isHead ? 'head' : 'body';
    }
    return 'wall';
  }

  function damageBot(bot, dmg, isHead, attacker) {
    if (!bot.alive) return;
    bot.hp -= dmg;
    bot.flashT = 0.12;
    if (bot.hp <= 0) {
      bot.hp = 0;
      bot.alive = false;
      bot.deathT = 0;
      hooks.onKill(bot, attacker, isHead);
    }
  }

  function damagePlayer(dmg, fromYaw) {
    const p = state.player;
    if (!p.alive || state.phase !== 'live') return;
    let remaining = dmg;
    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, remaining * 0.5);
      p.armor -= absorbed;
      remaining -= absorbed;
    }
    p.health -= remaining;
    p.hurtT = 0.5;
    p.lastHurtDir = fromYaw;
    hooks.onPlayerHurt();
    if (p.health <= 0) {
      p.health = 0;
      p.alive = false;
      hooks.onPlayerDeath();
    }
  }

  // One fixed step of grenade physics: gravity, wall bounce, fuse, boom.
  function grenadeStep(dt, colliders, bots) {
    for (let i = state.grenades.length - 1; i >= 0; i--) {
      const g = state.grenades[i];
      g.vy -= 12 * dt;
      const nx = g.x + g.vx * dt;
      const nz = g.z + g.vz * dt;
      // Cheap bounce: if the next position is inside a tall box, reflect.
      let blocked = false;
      for (const c of colliders) {
        if (c.h > g.y + 0.1 && nx > c.minX && nx < c.maxX && nz > c.minZ && nz < c.maxZ) { blocked = true; break; }
      }
      if (blocked || nx < -22.5 || nx > 22.5 || nz < -15.5 || nz > 15.5) {
        g.vx *= -0.35;
        g.vz *= -0.35;
        g.vy *= -0.35;
      } else {
        g.x = nx;
        g.z = nz;
      }
      g.y += g.vy * dt;
      if (g.y < 0.12) {
        g.y = 0.12;
        g.vy = Math.abs(g.vy) * 0.35;
        g.vx *= 0.7;
        g.vz *= 0.7;
      }
      g.fuse -= dt;
      if (g.fuse <= 0) {
        explode(g, bots);
        state.grenades.splice(i, 1);
      }
    }
  }

  function explode(g, bots) {
    boom.position.set(g.x, Math.max(0.4, g.y), g.z);
    boomLight.position.copy(boom.position);
    boom.visible = true;
    boomT = 0.45;
    hooks.onExplosion(g);
    const p = state.player;
    // Bots in the blast.
    for (const bot of bots) {
      if (!bot.alive) continue;
      const d = Math.hypot(bot.group.position.x - g.x, bot.group.position.z - g.z);
      if (d < GRENADE_RADIUS) {
        const dmg = GRENADE_MAX_DMG * (1 - d / GRENADE_RADIUS) + 20;
        damageBot(bot, dmg, false, g.fromPlayer ? 'player' : 'bot');
      }
    }
    // The player (half damage from their own grenade).
    if (p.alive) {
      const d = Math.hypot(p.pos.x - g.x, p.pos.z - g.z);
      if (d < GRENADE_RADIUS) {
        const dmg = (GRENADE_MAX_DMG * (1 - d / GRENADE_RADIUS) + 20) * (g.fromPlayer ? 0.5 : 1);
        damagePlayer(dmg, Math.atan2(p.pos.x - g.x, p.pos.z - g.z));
      }
    }
  }

  return { playerShoot, damageBot, damagePlayer, grenadeStep, explode, updateFx, spawnTracer };
}
