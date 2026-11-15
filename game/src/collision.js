// collision.js — axis-separated AABB movement for the player, bots and grenades.
// Colliders are flat {minX,maxX,minZ,maxZ,h} boxes; the world is built from them.
export function createColliders(list) {
  return list;
}

// Move a circle (radius r, feet at y, height h) by (dx,dz) with wall sliding.
// Returns nothing; pos is mutated. y is the feet height: boxes with h <= y are
// stepped over, taller ones block.
export function moveCircle(pos, dx, dz, r, y, colliders) {
  // X axis
  let nx = pos.x + dx;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.h <= y + 0.05) continue;
    if (pos.z + r > c.minZ && pos.z - r < c.maxZ) {
      if (nx + r > c.minX && nx - r < c.maxX) {
        nx = dx > 0 ? c.minX - r : c.maxX + r;
      }
    }
  }
  pos.x = nx;
  // Z axis
  let nz = pos.z + dz;
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.h <= y + 0.05) continue;
    if (pos.x + r > c.minX && pos.x - r < c.maxX) {
      if (nz + r > c.minZ && nz - r < c.maxZ) {
        nz = dz > 0 ? c.minZ - r : c.maxZ + r;
      }
    }
  }
  pos.z = nz;
}

// Does a circle at (x,z) overlap any collider tall enough to block?
export function circleBlocked(x, z, r, y, colliders) {
  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    if (c.h <= y + 0.05) continue;
    if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
  }
  return false;
}

// Point-in-box test used for the plant zone and the bomb pickup radius.
export function inRect(x, z, rect) {
  return x >= rect.minX && x <= rect.maxX && z >= rect.minZ && z <= rect.maxZ;
}
