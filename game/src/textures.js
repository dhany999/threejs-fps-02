// textures.js — every texture is drawn at runtime on a canvas. No image files,
// no network, nothing to download. Each maker returns a THREE.CanvasTexture.
import * as THREE from 'three';

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function speckle(ctx, size, n, colors, aMin, aMax, sMin, sMax, rand) {
  for (let i = 0; i < n; i++) {
    const s = sMin + rand() * (sMax - sMin);
    ctx.globalAlpha = aMin + rand() * (aMax - aMin);
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
  ctx.globalAlpha = 1;
}

// Deterministic speckles: the same seed draws the same texture every load.
function seeded(seed) {
  let a = seed | 0;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeTextures() {
  // Yard floor: dark concrete slabs with expansion joints and grime.
  const floor = canvas(256, (ctx, s) => {
    const r = seeded(11);
    ctx.fillStyle = '#33373c';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 900, ['#2b2f34', '#3a3f45', '#2e3237'], 0.25, 0.6, 1, 3, r);
    ctx.strokeStyle = '#26292d';
    ctx.lineWidth = 3;
    ctx.strokeRect(1, 1, s - 2, s - 2);
    ctx.beginPath();
    ctx.moveTo(s / 2, 0);
    ctx.lineTo(s / 2, s);
    ctx.moveTo(0, s / 2);
    ctx.lineTo(s, s / 2);
    ctx.stroke();
    // oil stains
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = '#14161a';
      ctx.beginPath();
      ctx.ellipse(r() * s, r() * s, 18 + r() * 30, 10 + r() * 18, r() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  });
  floor.repeat.set(12, 8);

  // Corrugated steel wall panels, rusted at the seams.
  const steel = canvas(256, (ctx, s) => {
    const r = seeded(23);
    ctx.fillStyle = '#4a5058';
    ctx.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 16) {
      ctx.fillStyle = (x / 16) % 2 === 0 ? '#525861' : '#43484f';
      ctx.fillRect(x, 0, 16, s);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 14, 0, 2, s);
    }
    speckle(ctx, s, 500, ['#7a5a38', '#5d4630', '#6e5238'], 0.2, 0.55, 1, 4, r);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, s - 10, s, 10);
  });
  steel.repeat.set(4, 1);

  // Hazard chevrons for the furnace base and the plant-zone border.
  const hazard = canvas(128, (ctx, s) => {
    ctx.fillStyle = '#d8a31e';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#1c1e22';
    for (let i = -2; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 32, s);
      ctx.lineTo(i * 32 + 32, 0);
      ctx.lineTo(i * 32 + 48, 0);
      ctx.lineTo(i * 32 + 16, s);
      ctx.closePath();
      ctx.fill();
    }
  });

  // Hot furnace face: dark plate with a glowing slit.
  const furnace = canvas(256, (ctx, s) => {
    const r = seeded(47);
    ctx.fillStyle = '#2c2724';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 700, ['#3a322c', '#241f1c', '#453a30'], 0.3, 0.7, 1, 4, r);
    const g = ctx.createLinearGradient(0, s * 0.42, 0, s * 0.58);
    g.addColorStop(0, 'rgba(255,110,20,0)');
    g.addColorStop(0.5, 'rgba(255,140,30,0.95)');
    g.addColorStop(1, 'rgba(255,110,20,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, s * 0.42, s, s * 0.16);
    ctx.fillStyle = '#ffcf8a';
    ctx.fillRect(0, s * 0.48, s, 3);
  });

  // Painted crate: flat steel with stencil marks.
  const crate = canvas(128, (ctx, s) => {
    const r = seeded(71);
    ctx.fillStyle = '#5d5648';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, 260, ['#524c3f', '#6a6255', '#4a443a'], 0.3, 0.6, 1, 3, r);
    ctx.strokeStyle = '#3d382f';
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, s - 8, s - 8);
    ctx.beginPath();
    ctx.moveTo(4, 4);
    ctx.lineTo(s - 4, s - 4);
    ctx.moveTo(s - 4, 4);
    ctx.lineTo(4, s - 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(232,114,42,0.85)';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.fillText('FY-7', 14, s - 16);
  });

  return { floor, steel, hazard, furnace, crate };
}
