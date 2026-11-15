// map.js — "Foundry Yard": an original industrial yard, 46 x 32 m.
// Three lanes (Slag Alley north, Crane Row mid, Mold Line south) link the Ember
// spawn in the west to the Furnace bomb site in the east. Nothing here evokes
// any commercial map: the layout, names and props are our own.
import * as THREE from 'three';
import { makeTextures } from './textures.js';

export const MAP_NAME = 'Foundry Yard';

// Colliders: flat boxes {minX,maxX,minZ,maxZ,h}. The mesh builder draws one
// box per collider, so art and collision can never drift apart.
const BOXES = [
  // Perimeter walls (h 4).
  { minX: -23, maxX: 23, minZ: -17, maxZ: -16, h: 4, mat: 'steel' },
  { minX: -23, maxX: 23, minZ: 16, maxZ: 17, h: 4, mat: 'steel' },
  { minX: -24, maxX: -23, minZ: -16, maxZ: 16, h: 4, mat: 'steel' },
  { minX: 23, maxX: 24, minZ: -16, maxZ: 16, h: 4, mat: 'steel' },
  // The Furnace: the bomb site's anchor, east end. Plant zone is its west face.
  { minX: 14, maxX: 19, minZ: -4, maxZ: 4, h: 5, mat: 'furnace' },
  // Gantry crane legs straddling Crane Row (mid).
  { minX: -0.5, maxX: 0.5, minZ: -3, maxZ: -2, h: 3.4, mat: 'steel' },
  { minX: -0.5, maxX: 0.5, minZ: 2, maxZ: 3, h: 3.4, mat: 'steel' },
  // Crouch-height cover walls on mid.
  { minX: -9, maxX: -6, minZ: -0.3, maxZ: 0.3, h: 1.1, mat: 'crate' },
  { minX: 6, maxX: 9, minZ: -0.3, maxZ: 0.3, h: 1.1, mat: 'crate' },
  // Barrel cluster, mid-east.
  { minX: 3, maxX: 5, minZ: 2, maxZ: 4, h: 1.2, mat: 'crate' },
  // Slag Alley (north lane) crates.
  { minX: -13, maxX: -11, minZ: -12, maxZ: -10, h: 2, mat: 'crate' },
  { minX: -7, maxX: -5.5, minZ: -12.5, maxZ: -11, h: 1.2, mat: 'crate' },
  { minX: 5, maxX: 7, minZ: -12, maxZ: -10.5, h: 2, mat: 'crate' },
  // Mold Line (south lane) containers.
  { minX: -14, maxX: -10, minZ: 10, maxZ: 12, h: 2.6, mat: 'steel' },
  { minX: 1, maxX: 4, minZ: 11, maxZ: 13, h: 2.6, mat: 'steel' },
  { minX: 11, maxX: 13, minZ: 9, maxZ: 11, h: 2, mat: 'crate' },
  // Connector corner blocks.
  { minX: -9, maxX: -7, minZ: -6.5, maxZ: -4.5, h: 2.4, mat: 'crate' },
  { minX: -9, maxX: -7, minZ: 4.5, maxZ: 6.5, h: 2.4, mat: 'crate' },
  { minX: 7, maxX: 9, minZ: -6.5, maxZ: -4.5, h: 2.4, mat: 'crate' },
  { minX: 7, maxX: 9, minZ: 4.5, maxZ: 6.5, h: 2.4, mat: 'crate' },
  // Spawn cover.
  { minX: -18.8, maxX: -17.2, minZ: -6.8, maxZ: -5.2, h: 1.2, mat: 'crate' },
  { minX: -18.8, maxX: -17.2, minZ: 5.2, maxZ: 6.8, h: 1.2, mat: 'crate' },
  { minX: 16, maxX: 18, minZ: -10, maxZ: -8, h: 2, mat: 'crate' },
  { minX: 16, maxX: 18, minZ: 8, maxZ: 10, h: 2, mat: 'crate' },
];

export const SITE_RECT = { minX: 10.5, maxX: 13.5, minZ: -5, maxZ: 5 };

// Waypoint graph the bots walk. Indices are stable; edges are bidirectional.
const WAYPOINTS = [
  [-20, 0], [-20, -5], [-20, 5], [-18, -9], [-18, 9],       // 0-4 Ember spawn
  [-14, 0], [-14, -11], [-14, 11],                            // 5-7
  [-8, 0], [-8, -11], [-8, 11], [-8, -5.5], [-8, 5.5],       // 8-12
  [-4, 0], [-4, -11], [-4, 11],                               // 13-15
  [0, 0], [0, -11], [0, 11],                                  // 16-18
  [4, 0], [4, -11], [4, 11],                                  // 19-21
  [8, 0], [8, -11], [8, 11], [8, -5.5], [8, 5.5],            // 22-26
  [12, 0], [12, -8], [12, 8],                                 // 27-29
  [12.5, 0], [12.5, -3.5], [12.5, 3.5],                      // 30-32 site
  [21, -7], [21, 0], [21, 7], [18, -11], [18, 11],           // 33-37 Slag spawn
  [11, -4], [11, 4],                                          // 38-39 site holds
  [-11, -5.5], [-11, 5.5], [5, -5.5], [5, 5.5],              // 40-43 connectors
];
const EDGES = [
  [0, 1], [0, 2], [0, 5], [1, 3], [2, 4], [3, 6], [4, 7],
  [5, 8], [5, 6], [5, 7], [5, 40], [5, 41],
  [6, 9], [6, 40], [7, 10], [7, 41],
  [8, 13], [8, 9], [8, 10], [8, 11], [8, 12],
  [9, 14], [9, 11], [10, 15], [10, 12],
  [11, 40], [12, 41], [11, 13], [12, 13],
  [13, 16], [13, 14], [13, 15],
  [14, 17], [15, 18],
  [16, 19], [16, 17], [16, 18], [16, 42], [16, 43],
  [17, 20], [17, 42], [18, 21], [18, 43],
  [19, 22], [19, 20], [19, 21],
  [20, 23], [20, 42], [21, 24], [21, 43],
  [22, 27], [22, 23], [22, 24], [22, 25], [22, 26],
  [23, 28], [23, 25], [24, 29], [24, 26],
  [25, 42], [26, 43], [25, 27], [26, 27],
  [27, 30], [27, 38], [27, 39],
  [28, 38], [28, 36], [28, 33],
  [29, 39], [29, 37], [29, 35],
  [30, 31], [30, 32], [31, 38], [32, 39],
  [33, 34], [33, 36], [34, 35], [35, 37],
  [40, 11], [41, 12], [42, 25], [43, 26],
];

export const EMBER_SPAWNS = [
  { x: -20, z: 0 }, { x: -20, z: -5 }, { x: -20, z: 5 }, { x: -18, z: -9 }, { x: -18, z: 9 },
];
export const SLAG_SPAWNS = [
  { x: 21, z: -7 }, { x: 21, z: 0 }, { x: 21, z: 7 }, { x: 18, z: -11 }, { x: 18, z: 11 },
];
// Defender hold posts: site front, site flanks, connectors, north/south.
// None of them has a sightline to the Ember spawn (all > 26 m or blocked),
// so defenders cannot camp the spawn at round start.
export const DEFEND_HOLDS = [38, 39, 27, 25, 26, 20, 21, 28];

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c1e22';
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = '#e8722a';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = '#e9e6df';
  ctx.font = 'bold 44px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createMap(scene) {
  const tex = makeTextures();
  const mats = {
    steel: new THREE.MeshStandardMaterial({ map: tex.steel, roughness: 0.85, metalness: 0.35 }),
    crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.9, metalness: 0.15 }),
    furnace: new THREE.MeshStandardMaterial({ map: tex.furnace, roughness: 0.7, metalness: 0.4, emissive: 0xff5a00, emissiveIntensity: 0.12, emissiveMap: tex.furnace }),
    floor: new THREE.MeshStandardMaterial({ map: tex.floor, roughness: 0.95, metalness: 0.05 }),
    hazard: new THREE.MeshStandardMaterial({ map: tex.hazard, roughness: 0.8 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.9, metalness: 0.3 }),
  };

  const shootables = [];
  const colliders = BOXES.map((b) => ({ ...b }));

  // Floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(48, 34), mats.floor);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0, 0);
  floor.receiveShadow = true;
  scene.add(floor);

  // One box mesh per collider; the furnace gets a hazard skirt and a chimney.
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  for (const b of BOXES) {
    const mesh = new THREE.Mesh(boxGeo, mats[b.mat]);
    mesh.scale.set(b.maxX - b.minX, b.h, b.maxZ - b.minZ);
    mesh.position.set((b.minX + b.maxX) / 2, b.h / 2, (b.minZ + b.maxZ) / 2);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.solid = true;
    scene.add(mesh);
    shootables.push(mesh);
  }

  // Furnace chimney + glow.
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 6, 10), mats.dark);
  chimney.position.set(16.5, 8, 0);
  chimney.castShadow = true;
  scene.add(chimney);
  const furnaceLight = new THREE.PointLight(0xff6a1e, 60, 22, 1.8);
  furnaceLight.position.set(12.5, 2.2, 0);
  scene.add(furnaceLight);

  // Gantry crane beam across mid (above head height, visual only).
  const beam = new THREE.Mesh(boxGeo, mats.dark);
  beam.scale.set(1, 0.7, 7);
  beam.position.set(0, 3.8, 0);
  beam.castShadow = true;
  scene.add(beam);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.2, 0.4), mats.hazard);
  hook.position.set(0, 3.1, 1.2);
  scene.add(hook);

  // Pipes along the north wall.
  const pipeGeo = new THREE.CylinderGeometry(0.28, 0.28, 40, 8);
  for (const y of [2.6, 3.1]) {
    const pipe = new THREE.Mesh(pipeGeo, mats.dark);
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set(0, y, -15.6);
    scene.add(pipe);
  }

  // Slag piles (cones) tucked against the east wall, out of the lanes.
  const coneGeo = new THREE.ConeGeometry(1.6, 1.4, 8);
  for (const [x, z] of [[21.5, -13.5], [21.5, 13.5], [-21.5, -13.5]]) {
    const pile = new THREE.Mesh(coneGeo, mats.dark);
    pile.position.set(x, 0.7, z);
    pile.castShadow = true;
    scene.add(pile);
  }

  // Plant-zone marker: hazard border flat on the floor + a sign over the site.
  const zone = new THREE.Mesh(new THREE.PlaneGeometry(3, 10), new THREE.MeshBasicMaterial({ map: tex.hazard, transparent: true, opacity: 0.55 }));
  zone.rotation.x = -Math.PI / 2;
  zone.position.set(12, 0.02, 0);
  scene.add(zone);
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: signTexture('FURNACE  •  SITE A') }),
  );
  sign.position.set(13.9, 3.6, 0);
  sign.rotation.y = -Math.PI / 2;
  scene.add(sign);
  const yardSign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: signTexture('FOUNDRY YARD') }),
  );
  yardSign.position.set(-22.4, 3.4, 0);
  yardSign.rotation.y = Math.PI / 2;
  scene.add(yardSign);

  // Waypoint adjacency.
  const waypoints = WAYPOINTS.map(([x, z]) => ({ x, z, edges: [] }));
  for (const [a, b] of EDGES) {
    waypoints[a].edges.push(b);
    waypoints[b].edges.push(a);
  }

  return {
    colliders,
    shootables,
    siteRect: SITE_RECT,
    waypoints,
    emberSpawns: EMBER_SPAWNS,
    slagSpawns: SLAG_SPAWNS,
    defendHolds: DEFEND_HOLDS,
    furnaceLight,
  };
}
