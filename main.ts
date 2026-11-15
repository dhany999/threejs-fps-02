// Entry program for the threejs-fps-02 bounty (Node 22, standard library only).
//
// The game is the plain static files in game/ beside this file: an ES-module
// three.js 0.187.0 tactical FPS that opens in desktop Chrome with no build
// step and no network. This program hands the entry in: it copies game/ and
// screenshots/ into the output directory and writes dossier.json there with
// the vendored make.fun library, so the judge can read the game from the
// dossier alone. The program runs twice and both runs must write identical
// bytes, so nothing here depends on time, randomness, or the environment
// beyond the output directory itself.
//
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The directory this file lives in; game/ and screenshots/ sit beside it.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Caps from the scorer's gate: the text cap shapes the dossier's bytes, the
// rest refuse an entry the scorer would refuse anyway (at most 4 screenshots
// and 256 KiB each; at most 993 entries and 48 MiB in game/, which also has
// to leave room in /output's own 1000-entry, 64 MiB cap for the screenshots
// and the dossier itself).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
} as const;

// Fail loudly instead of handing in an empty entry: the grader would
// refuse a missing game/ anyway, and a silent copy of nothing is worse.
if (!existsSync(join(here, 'game', 'index.html'))) {
  throw new Error('game/index.html is missing next to main.ts; refusing to build an empty entry');
}

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, DOSSIER_CAPS));
