/**
 * 3D-LUT im `.cube`-Format.
 *
 * Das ist der Ausgang in den Rest der Welt: Resolve, Lumetri, Premiere und OBS
 * lesen es alle. Der parametrische Look bleibt daneben bestehen — das LUT ist die
 * gebackene Fassung für Programme, die MOTIF nicht kennen (PROJECT_PROMPT.md §8).
 */

import { clamp01, type Rgb } from './color.ts';

export const DEFAULT_SIZE = 33;

export type CubeLut = {
  size: number;
  /** size³ Einträge in der Reihenfolge des Formats: rot läuft am schnellsten. */
  entries: Rgb[];
  title?: string;
};

/** LUT aus einer Farbabbildung backen. */
export function bakeCube(map: (rgb: Rgb) => Rgb, size = DEFAULT_SIZE, title?: string): CubeLut {
  const entries: Rgb[] = [];
  const last = size - 1;

  // Reihenfolge ist Teil des Formats: b außen, r innen.
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        const mapped = map([r / last, g / last, b / last]);
        entries.push([clamp01(mapped[0]), clamp01(mapped[1]), clamp01(mapped[2])]);
      }
    }
  }
  return { size, entries, title };
}

export function serializeCube(lut: CubeLut): string {
  const lines = [
    `# Erzeugt von RotoScope Studio`,
    lut.title ? `TITLE "${lut.title.replace(/"/g, "'")}"` : null,
    `LUT_3D_SIZE ${lut.size}`,
    `DOMAIN_MIN 0.0 0.0 0.0`,
    `DOMAIN_MAX 1.0 1.0 1.0`,
    '',
    ...lut.entries.map((e) => e.map((v) => v.toFixed(6)).join(' ')),
  ];
  return lines.filter((line) => line !== null).join('\n') + '\n';
}

/** Zurücklesen — die Grundlage dafür, das Geschriebene zu prüfen statt zu glauben. */
export function parseCube(text: string): CubeLut {
  let size = 0;
  let title: string | undefined;
  const entries: Rgb[] = [];

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    if (line.startsWith('LUT_3D_SIZE')) {
      size = Number(line.split(/\s+/)[1]);
      continue;
    }
    if (line.startsWith('TITLE')) {
      title = line.slice(5).trim().replace(/^"|"$/g, '');
      continue;
    }
    if (line.startsWith('DOMAIN_') || line.startsWith('LUT_1D_SIZE')) continue;

    const parts = line.split(/\s+/).map(Number);
    if (parts.length === 3 && parts.every((n) => Number.isFinite(n))) {
      entries.push([parts[0], parts[1], parts[2]]);
    }
  }

  if (!size) throw new Error('LUT_3D_SIZE fehlt.');
  if (entries.length !== size ** 3) {
    throw new Error(`LUT hat ${entries.length} Einträge, erwartet ${size ** 3}.`);
  }
  return { size, entries, title };
}

/** Nachschlagen mit trilinearer Interpolation — zum Prüfen und für die Vorschau ohne GPU. */
export function sampleCube(lut: CubeLut, rgb: Rgb): Rgb {
  const last = lut.size - 1;
  const position = rgb.map((v) => clamp01(v) * last);
  const base = position.map(Math.floor);
  const frac = position.map((v, i) => v - base[i]);

  const at = (r: number, g: number, b: number): Rgb =>
    lut.entries[
      Math.min(b, last) * lut.size * lut.size + Math.min(g, last) * lut.size + Math.min(r, last)
    ];

  const out: Rgb = [0, 0, 0];
  for (let corner = 0; corner < 8; corner++) {
    const dr = corner & 1;
    const dg = (corner >> 1) & 1;
    const db = (corner >> 2) & 1;
    const weight =
      (dr ? frac[0] : 1 - frac[0]) * (dg ? frac[1] : 1 - frac[1]) * (db ? frac[2] : 1 - frac[2]);
    if (weight === 0) continue;
    const sample = at(base[0] + dr, base[1] + dg, base[2] + db);
    out[0] += sample[0] * weight;
    out[1] += sample[1] * weight;
    out[2] += sample[2] * weight;
  }
  return out;
}
