/** grade-core — Farbtransfer aus Referenzbildern und LUT-Ausgabe. */

export * from './color.ts';
export * from './stats.ts';
export * from './transfer.ts';
export * from './cube.ts';

import { bakeCube, DEFAULT_SIZE, type CubeLut } from './cube.ts';
import type { Rgb } from './color.ts';
import { applyRgb, type Look } from './transfer.ts';

/** Look als 3D-LUT backen — der Weg nach Resolve, Lumetri und Premiere. */
export function lookToCube(look: Look, mix = 1, size = DEFAULT_SIZE, title?: string): CubeLut {
  return bakeCube((rgb: Rgb) => applyRgb(look, rgb, mix), size, title);
}
