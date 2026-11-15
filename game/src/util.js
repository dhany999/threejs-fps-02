// util.js — tiny pure helpers shared by the simulation. No allocations in hot paths.
export function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
export function lerp(a, b, t) { return a + (b - a) * t; }

// Deterministic RNG (mulberry32) so ?shot= captures are reproducible.
export function mulberry32(seed) {
  let a = seed | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 2D segment vs AABB test, used for line-of-sight. `hMin` ignores low cover.
export function segmentBlocked(x0, z0, x1, z1, colliders, hMin) {
  const dx = x1 - x0;
  const dz = z1 - z0;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.h < hMin) continue;
    // Slab test in 2D.
    let tmin = 0;
    let tmax = 1;
    if (dx === 0) {
      if (x0 < c.minX || x0 > c.maxX) continue;
    } else {
      let t1 = (c.minX - x0) / dx;
      let t2 = (c.maxX - x0) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (dz === 0) {
      if (z0 < c.minZ || z0 > c.maxZ) continue;
    } else {
      let t1 = (c.minZ - z0) / dz;
      let t2 = (c.maxZ - z0) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    return true;
  }
  return false;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
