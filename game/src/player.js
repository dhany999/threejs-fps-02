// player.js — first-person movement: acceleration, friction, crouch, jump,
// AABB collision. The sim owns the numbers; the camera just follows the eye.
import { clamp, lerp } from './util.js';
import { moveCircle } from './collision.js';

const RADIUS = 0.35;
const STAND_EYE = 1.62;
const CROUCH_EYE = 1.05;
const WALK_SPEED = 4.3;
const CROUCH_SPEED = 2.1;
const ACCEL = 42;
const FRICTION = 10;
const GRAVITY = 14;
const JUMP_VEL = 5.4;
const LOOK_SENS = 0.0021;

export function createPlayer(state) {
  const p = state.player;
  let stepTimer = 0;

  function look(dx, dy) {
    p.yaw -= dx * LOOK_SENS;
    p.pitch = clamp(p.pitch - dy * LOOK_SENS, -1.52, 1.52);
  }

  function recoil(pitchKick, yawKick) {
    p.pitch = clamp(p.pitch + pitchKick, -1.52, 1.52);
    p.yaw += yawKick;
    p.recoil = Math.min(0.06, p.recoil + pitchKick);
  }

  // One fixed step of movement. `keys` is the input key set.
  function step(dt, keys, colliders, onStepSound) {
    const crouchHeld = keys.has('ControlLeft') || keys.has('KeyC');
    p.crouched = crouchHeld;
    const targetEye = crouchHeld ? CROUCH_EYE : STAND_EYE;
    p.eye = lerp(p.eye, targetEye, Math.min(1, dt * 12));

    // Wish direction from keys, in world space.
    let fx = 0;
    let fz = 0;
    if (keys.has('KeyW')) fz += 1;
    if (keys.has('KeyS')) fz -= 1;
    if (keys.has('KeyD')) fx += 1;
    if (keys.has('KeyA')) fx -= 1;
    const len = Math.hypot(fx, fz);
    if (len > 0) { fx /= len; fz /= len; }
    // Forward is -z rotated by yaw: forward = (-sin(yaw), -cos(yaw)) in xz.
    const sin = Math.sin(p.yaw);
    const cos = Math.cos(p.yaw);
    const wx = fx * cos - fz * sin;
    const wz = -fx * sin - fz * cos;

    const maxSpeed = crouchHeld ? CROUCH_SPEED : WALK_SPEED;
    const accel = p.onGround ? ACCEL : ACCEL * 0.25;
    p.vel.x += wx * accel * dt;
    p.vel.z += wz * accel * dt;
    // Friction when no input, and a cap so acceleration never runs away.
    const speed2d = Math.hypot(p.vel.x, p.vel.z);
    if (len === 0 && p.onGround && speed2d > 0) {
      // Simple exponential friction.
      const f = Math.max(0, 1 - FRICTION * dt);
      p.vel.x *= f;
      p.vel.z *= f;
    }
    const capped = Math.hypot(p.vel.x, p.vel.z);
    if (capped > maxSpeed) {
      const s = maxSpeed / capped;
      p.vel.x *= s;
      p.vel.z *= s;
    }
    p.speed2d = Math.hypot(p.vel.x, p.vel.z);

    // Gravity and jump.
    p.vel.y -= GRAVITY * dt;
    if (keys.has('Space') && p.onGround) {
      p.vel.y = JUMP_VEL;
      p.onGround = false;
    }
    p.pos.y += p.vel.y * dt;
    if (p.pos.y <= 0) {
      p.pos.y = 0;
      p.vel.y = 0;
      p.onGround = true;
    }

    moveCircle(p.pos, p.vel.x * dt, p.vel.z * dt, RADIUS, p.pos.y, colliders);

    // Footsteps: a soft tick every stride while moving on the ground.
    stepTimer += dt * p.speed2d;
    if (p.onGround && p.speed2d > 1.5 && stepTimer > 2.2) {
      stepTimer = 0;
      if (onStepSound) onStepSound();
    }

    // Recoil recovery: the view settles back toward where it was.
    if (p.recoil > 0) {
      const rec = Math.min(p.recoil, dt * 0.09);
      p.pitch = clamp(p.pitch - rec, -1.52, 1.52);
      p.recoil -= rec;
    }
  }

  return { look, recoil, step };
}
