/**
 * Verknuepfung von Feldern und das Ringprofil.
 *
 * Zwei Verknuepfungen sind noetig, nicht eine: fuer die organischen Doppellappen
 * (Referenzbild 5) das weiche Verschmelzen, fuer Rohrkreuzungen (Bild 2) die exakte
 * Vereinigung. Smooth-min beult genau dort aus, wo diese Grafik sauber ist (Spec §2).
 */

import type { Vec2 } from './shapes.ts';

export type CombineMode = 'union' | 'subtract' | 'intersect' | 'smooth';

/** Exakte Vereinigung. Erhaelt scharfe Kreuzungen. */
export const union = (a: number, b: number) => Math.min(a, b);
export const subtract = (a: number, b: number) => Math.max(a, -b);
export const intersect = (a: number, b: number) => Math.max(a, b);

/** Polynomiales smooth-min: verschmilzt zwei Felder auf `k` Breite. */
export function smoothUnion(a: number, b: number, k: number): number {
  if (k <= 0) return union(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

export function combine(mode: CombineMode, a: number, b: number, smoothness = 0): number {
  switch (mode) {
    case 'union':
      return union(a, b);
    case 'subtract':
      return subtract(a, b);
    case 'intersect':
      return intersect(a, b);
    case 'smooth':
      return smoothUnion(a, b, smoothness);
  }
}

/** Spiegelung als Feldoperation: eine Zeile, und Bild 5 und 6 werden erreichbar. */
export function mirror(point: Vec2, axis: 'x' | 'y' | 'both' | 'none'): Vec2 {
  switch (axis) {
    case 'x':
      return [Math.abs(point[0]), point[1]];
    case 'y':
      return [point[0], Math.abs(point[1])];
    case 'both':
      return [Math.abs(point[0]), Math.abs(point[1])];
    case 'none':
      return point;
  }
}

/**
 * Ringprofil — was aus dem Abstand die sichtbaren Baender macht.
 *
 * Vier Groessen, nicht eine (Spec §4):
 *
 * - `spacing`  Abstand zwischen den Baendern
 * - `curve`    ungleichmaessiger Rhythmus. **Der wichtigste Regler ueberhaupt**:
 *              gleichabstaendige Ringe wirken sofort generiert. 1 ist gleichmaessig,
 *              **groesser als 1 macht die Baender nach aussen enger** (so wie in
 *              Referenzbild 5), kleiner als 1 spreizt sie nach aussen auf.
 * - `hardness` hart gestuft (Bild 5) bis fliessend (Bild 4)
 * - `line`     Breite der duennen dunklen Trennlinie zwischen den Baendern (Bild 5)
 */
export type RingProfile = {
  spacing: number;
  curve: number;
  hardness: number;
  line: number;
  /** Zeitversatz pro Bandindex — daraus entsteht das Wellengefuehl (Spec §6). */
  stagger: number;
};

export type RingSample = {
  /** Fortlaufender Bandindex, auch gebrochen — die Palette liest ihn. */
  index: number;
  /** Position innerhalb des Bandes, 0 bis 1. */
  fraction: number;
  /** 1 auf der Trennlinie, 0 daneben, weich ueber `hardness`. */
  separator: number;
};

const smoothstep = (edge0: number, edge1: number, x: number) => {
  if (edge1 <= edge0) return x < edge1 ? 0 : 1;
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

export function sampleRings(distance: number, profile: RingProfile): RingSample {
  const spacing = Math.max(1e-4, profile.spacing);
  const normalized = Math.abs(distance) / spacing;

  // Die Kurve staucht oder dehnt den Rhythmus nach aussen. 1 = gleichabstaendig.
  const shaped = normalized ** Math.max(0.05, profile.curve);
  const index = Math.floor(shaped);
  const fraction = shaped - index;

  // Trennlinie sitzt am Bandanfang; `hardness` steuert, wie scharf ihre Kante ist.
  const halfLine = Math.max(0, profile.line) * 0.5;
  const softness = (1 - Math.max(0, Math.min(1, profile.hardness))) * 0.5 + 1e-4;
  const separator =
    1 - smoothstep(halfLine, halfLine + softness, Math.min(fraction, 1 - fraction));

  return { index, fraction, separator };
}

export const FIELD_GLSL = `
float fieldUnion(float a, float b) { return min(a, b); }
float fieldSubtract(float a, float b) { return max(a, -b); }
float fieldIntersect(float a, float b) { return max(a, b); }

float fieldSmoothUnion(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

vec2 fieldMirror(vec2 p, int axis) {
  if (axis == 1) return vec2(abs(p.x), p.y);
  if (axis == 2) return vec2(p.x, abs(p.y));
  if (axis == 3) return abs(p);
  return p;
}

// Gibt (index, fraction, separator) zurueck -- muss sich wie sampleRings verhalten.
vec3 fieldRings(float distance, float spacing, float curve, float hardness, float line) {
  float s = max(1e-4, spacing);
  float shaped = pow(abs(distance) / s, max(0.05, curve));
  float index = floor(shaped);
  float fraction = shaped - index;

  float halfLine = max(0.0, line) * 0.5;
  float softness = (1.0 - clamp(hardness, 0.0, 1.0)) * 0.5 + 1e-4;
  float edge = min(fraction, 1.0 - fraction);
  float separator = 1.0 - smoothstep(halfLine, halfLine + softness, edge);

  return vec3(index, fraction, separator);
}
`;
