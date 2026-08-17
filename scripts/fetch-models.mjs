#!/usr/bin/env node
/**
 * Modelle holen — plattformunabhaengig, ohne Python.
 *
 * Die Checkpoints liegen bewusst nicht im Repo (mehrere hundert MB, und teils
 * unter Lizenzen, die eine Weitergabe nicht erlauben). Dieses Skript holt genau
 * die, die geprueft und freigegeben sind (docs/licenses/).
 *
 *   node scripts/fetch-models.mjs           alles Freigegebene
 *   node scripts/fetch-models.mjs depth     nur die Tiefenkarte
 */

import { createWriteStream } from 'node:fs';
import { mkdir, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'checkpoints');

/** Nur Modelle mit geklaerter Lizenz. Wer etwas ergaenzt, legt zuerst docs/licenses/<name>.md an. */
const MODELLE = {
  depth: {
    datei: 'depth-anything-v2-small.onnx',
    url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
    lizenz: 'Apache-2.0 (nur die Small-Variante — Large ist CC-BY-NC-4.0 und gesperrt)',
    groesse: '95 MB',
  },
  sam2_tiny: {
    datei: 'sam2.1_hiera_tiny.pt',
    url: 'https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt',
    lizenz: 'Apache-2.0, Code und Gewichte',
    groesse: '149 MB',
  },
};

async function holen(schluessel) {
  const modell = MODELLE[schluessel];
  if (!modell) throw new Error(`Unbekanntes Modell: ${schluessel}`);

  const ziel = join(target, modell.datei);
  const vorhanden = await stat(ziel).then((s) => s.size, () => 0);
  if (vorhanden > 0) {
    console.log(`  vorhanden  ${modell.datei} (${(vorhanden / 1024 ** 2).toFixed(0)} MB)`);
    return;
  }

  console.log(`  lade       ${modell.datei} (${modell.groesse}) — ${modell.lizenz}`);
  const antwort = await fetch(modell.url, { redirect: 'follow' });
  if (!antwort.ok || !antwort.body) throw new Error(`HTTP ${antwort.status} bei ${modell.url}`);
  await pipeline(Readable.fromWeb(antwort.body), createWriteStream(ziel));

  const groesse = (await stat(ziel)).size;
  console.log(`  fertig     ${modell.datei} (${(groesse / 1024 ** 2).toFixed(0)} MB)`);
}

await mkdir(target, { recursive: true });
const gewuenscht = process.argv.slice(2);
const auswahl = gewuenscht.length ? gewuenscht : Object.keys(MODELLE);

console.log(`Modelle nach ${target}`);
for (const schluessel of auswahl) await holen(schluessel);
console.log('\nLizenzen: docs/licenses/ — jedes Modell hat dort eine Datei.');
