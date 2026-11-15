// input.js — keyboard, mouse look, pointer lock and wheel. Keeps a key set and
// an accumulated look delta the sim consumes each frame; nothing else reads
// DOM events directly.
//
// Pointer-lock recovery: a failed lock request is retried once after the
// browser's post-exit cooldown (1.5 s), and if that also fails the input
// drops into drag-to-look mode (hold the mouse button and drag to aim,
// click to fire) instead of leaving look/fire dead for the rest of the
// match. A successful lock always clears drag mode. A click on the canvas
// itself asks for the lock again (via callbacks.onCanvasClick).
export function createInput(canvas, callbacks) {
  const keys = new Set();
  const look = { x: 0, y: 0 };
  let firing = false;
  let locked = false;
  let wheelDelta = 0;
  let dragMode = false;
  let dragging = false;
  let retryT = 0;

  function onKeyDown(e) {
    if (e.repeat) return;
    keys.add(e.code);
    if (callbacks.onKeyDown) callbacks.onKeyDown(e.code);
    if (e.code === 'Space') e.preventDefault();
  }
  function onKeyUp(e) { keys.delete(e.code); }
  function onMouseMove(e) {
    if (locked || (dragMode && dragging)) {
      look.x += e.movementX;
      look.y += e.movementY;
    }
  }
  function onMouseDown(e) {
    if (e.button !== 0) return;
    if (locked || dragMode) {
      if (dragMode) dragging = true;
      firing = true;
    }
  }
  function onMouseUp(e) {
    if (e.button === 0) {
      dragging = false;
      firing = false;
    }
  }
  function onWheel(e) { wheelDelta += Math.sign(e.deltaY); }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (locked) {
      // A real lock beats the fallback: leave drag mode behind.
      dragMode = false;
      dragging = false;
      if (retryT) { window.clearTimeout(retryT); retryT = 0; }
    }
    if (callbacks.onLockChange) callbacks.onLockChange(locked);
  }
  function onBlur() {
    keys.clear();
    firing = false;
  }

  function onCanvasMouseDown() {
    // A click on the game itself re-locks the mouse: the recovery path when
    // a round starts unlocked and no overlay is up to click instead.
    if (locked || dragMode) return;
    if (callbacks.onCanvasClick) callbacks.onCanvasClick();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('wheel', onWheel);
  document.addEventListener('pointerlockchange', onLockChange);
  canvas.addEventListener('mousedown', onCanvasMouseDown);

  function lockWanted() {
    return !callbacks.lockWanted || callbacks.lockWanted();
  }
  function attemptLock() {
    try {
      return canvas.requestPointerLock();
    } catch (e) {
      return Promise.resolve(false);
    }
  }
  // One delayed retry after a failure: browsers reject a re-request made
  // too soon after the lock was exited (e.g. Esc), so a single retry 1.5 s
  // later recovers those instead of dropping straight to drag mode.
  function scheduleLockRetry() {
    if (retryT || locked || !lockWanted()) return;
    retryT = window.setTimeout(() => {
      retryT = 0;
      if (locked || !lockWanted()) return;
      const r = attemptLock();
      if (r && typeof r.catch === 'function') {
        r.catch(() => {
          if (locked || !lockWanted()) return;
          dragMode = true;
          if (callbacks.onLockFailed) callbacks.onLockFailed();
        });
      }
    }, 1500);
  }

  return {
    keys,
    get firing() { return firing; },
    get locked() { return locked; },
    get dragMode() { return dragMode; },
    requestLock() {
      if (locked) return;
      const r = attemptLock();
      if (r && typeof r.catch === 'function') r.catch(() => scheduleLockRetry());
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
