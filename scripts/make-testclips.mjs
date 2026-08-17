#!/usr/bin/env node
/** Zwei Testclips fuer die Transition-Ansicht erzeugen. Braucht ffmpeg im PATH. */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'apps', 'studio-web', 'public');

const clips = [
  ['dev-sample.mp4', 'testsrc2=size=1280x720:rate=25:duration=3'],
  ['dev-b.mp4', 'testsrc=size=1280x720:rate=25:duration=2'],
];

await mkdir(out, { recursive: true });
for (const [datei, quelle] of clips) {
  const ziel = join(out, datei);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', quelle,
                       '-c:v', 'libx264', '-pix_fmt', 'yuv420p', ziel]);
  console.log('  erzeugt', datei);
}
console.log('');
console.log('Oeffnen: http://localhost:5173/?clip=/dev-sample.mp4');
