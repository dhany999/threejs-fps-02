// input.js — keyboard, mouse look, pointer lock and wheel. Keeps a key set and
// an accumulated look delta the sim consumes each frame; nothing else reads
// DOM events directly.
export function createInput(canvas, callbacks) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  let firing = false;
  let locked = false;
  let wheelDelta = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (callbacks.onKeyDown) callbacks.onKeyDown(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (!locked) return;
    look.x += e.movementX;
    look.y += e.movementY;
  }
  function onMouseDown(e) {
    if (!locked) return;
    if (e.button === 0) firing = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) firing = false;
  }
  function onWheel(e) { wheelDelta += Math.sign(e.deltaY); }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (callbacks.onLockChange) callbacks.onLockChange(locked);
  }
  function onBlur() {
    keys.clear();
    firing = false;
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('wheel', onWheel);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    keys,
    get firing() { return firing; },
    get locked() { return locked; },
    requestLock() {
      if (locked) return;
      try {
        const r = canvas.requestPointerLock();
        if (r && typeof r.catch === 'function') r.catch(() => {});
      } catch (e) { /* pointer lock unavailable; the game still runs */ }
    },
    exitLock() {
      if (document.pointerLockElement) document.exitPointerLock();
    },
    // Consume the accumulated look since the last call (pixels).
    takeLook() {
      const out = { x: look.x, y: look.y };
      look.x = 0;
      look.y = 0;
      return out;
    },
    takeWheel() {
      const d = wheelDelta;
      wheelDelta = 0;
      return d;
    },
  };
}
