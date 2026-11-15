// state.js — the one place the game's state lives. Every module reads or writes
// fields of this object; nothing keeps a second copy of round, money or health.
import { mulberry32 } from './util.js';

export const TEAMS = { EMBER: 0, SLAG: 1 };
export const TEAM_NAME = ['Ember', 'Slag'];
export const TEAM_COLOR = [0xe8722a, 0x2aa8a0];
export const TEAM_CSS = ['#e8722a', '#2aa8a0'];

export const FIXED_STEP = 1 / 60;
export const ROUND_TIME = 100;      // seconds of live play
export const BUY_TIME = 12;         // seconds of buy phase before a round
export const END_TIME = 5;          // seconds the round-end banner shows
export const BOMB_TIME = 35;        // seconds from plant to detonation
export const PLANT_TIME = 3;        // seconds holding E to plant
export const DEFUSE_TIME = 5;       // seconds holding E to defuse
export const WIN_ROUNDS = 8;        // first to this many rounds wins the match
export const START_MONEY = 800;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1900;
export const PLANT_REWARD = 300;

// Weapon definitions. Damage is body damage; headshots multiply by headMult.
export const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'VK-9 Longbore', price: 2700, auto: true,
    magSize: 30, reserveMax: 120, fireInterval: 0.1, reloadTime: 2.4,
    damage: 34, headMult: 4, baseSpread: 0.006, moveSpread: 0.03,
    recoilPitch: 0.011, recoilYaw: 0.004, range: 90,
  },
  pistol: {
    id: 'pistol', name: 'P9 Sidearm', price: 300, auto: false,
    magSize: 12, reserveMax: 48, fireInterval: 0.22, reloadTime: 1.6,
    damage: 26, headMult: 4, baseSpread: 0.009, moveSpread: 0.02,
    recoilPitch: 0.009, recoilYaw: 0.003, range: 60,
  },
};
export const GRENADE_PRICE = 300;
export const ARMOR_PRICE = 650;

export function createState(seed) {
  const random = mulberry32(seed);
  return {
    seed,
    random,
    time: 0,                 // total sim time
    phase: 'menu',           // menu | buy | live | end | matchEnd
    phaseT: 0,               // seconds left in the current phase
    round: 1,
    score: [0, 0],           // rounds won, [Ember, Slag]
    kills: [0, 0],
    money: START_MONEY,
    bomb: {
      state: 'carry',        // carry | dropped | planted | defused | exploded
      holder: null,          // bot id carrying it, or 'player'
      x: 0, z: 0,            // ground position when dropped / planted
      plantT: 0,             // plant progress 0..1 (channel)
      defuseT: 0,
      timer: 0,              // seconds to detonation once planted
      planter: null,         // who is planting
      defuser: null,
    },
    player: {
      pos: { x: -20, y: 0, z: 0 },
      vel: { x: 0, y: 0, z: 0 },
      yaw: -Math.PI / 2,     // facing +x (toward the site)
      pitch: 0,
      eye: 1.62,
      crouched: false,
      onGround: true,
      health: 100,
      armor: 0,
      alive: true,
      hasRifle: false,
      grenades: 0,
      weapon: 'pistol',
      // per-weapon runtime, filled by weapons.js
      arms: {},
      spread: 0,
      recoil: 0,
      lastHurtDir: 0,
      hurtT: 0,
      speed2d: 0,
    },
    bots: [],                // bot records, filled by bots.js
    grenades: [],            // live thrown grenades {x,y,z,vx,vy,vz,fuse}
    noises: [],              // {x,z,radius,ttl} gunshots bots can hear
    feed: [],                // killfeed entries {text, team, ttl}
    banner: null,            // {title, sub, ttl}
    roundWinner: -1,
    roundReason: '',
    matchWinner: -1,
    shotMode: 0,             // 0 = normal play, 1..4 = photo mode
  };
}
