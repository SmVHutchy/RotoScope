/**
 * Bewegung — und zwar nahtlos.
 *
 * Alles laeuft ueber eine Phase von 0 bis 1. Bei Phase 1 muss **exakt** wieder das
 * Bild von Phase 0 stehen, sonst ist der Ansatz im Loop sichtbar.
 *
 * Der Fallstrick ist das Rauschen: entlang einer geraden Zeitachse abgetastet kehrt
 * es nie zurueck. Deshalb wird es **ueber einen geschlossenen Kreis im Rauschraum**
 * abgetastet (Spec §6) — nach einer vollen Umrundung ist man wieder am Ausgangspunkt.
 * Nachtraeglich eingezogen haette das jeden bewegten Parameter noch einmal gekostet.
 */

import type { Vec2 } from './shapes.ts';

export type MotionSpec = {
  /** Dauer eines Durchlaufs in Frames. */
  durationFrames: number;
  /** Baender wandern nach aussen: Anzahl Baender je Durchlauf. **Ganzzahlig fuer nahtlos.** */
  drift: number;
  /** Pulsieren der Groesse, relativ. Laeuft ueber einen Sinus und schliesst immer. */
  pulse: number;
  /** Drehungen je Durchlauf. **Ganzzahlig fuer nahtlos.** */
  spin: number;
  /** Staerke der Rauschverzerrung. Schliesst immer, weil der Kreis geschlossen ist. */
  wobble: number;
};

export const NO_MOTION: MotionSpec = {
  durationFrames: 100,
  drift: 0,
  pulse: 0,
  spin: 0,
  wobble: 0,
};

const TAU = Math.PI * 2;

function hash(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

/** Glattes Wertrauschen, damit die Verzerrung fliesst statt zu flackern. */
export function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);

  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

/**
 * Den Abtastpunkt fuer eine Phase transformieren.
 *
 * `scale` muss der Aufrufer auf den Abstand multiplizieren: wer den Punkt staucht,
 * staucht auch die Abstaende, und die Baender waeren sonst falsch breit.
 */
export function motionTransform(
  point: Vec2,
  phase: number,
  motion: MotionSpec,
): { point: Vec2; scale: number } {
  let [x, y] = point;

  if (motion.spin) {
    const angle = -motion.spin * TAU * phase;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    [x, y] = [x * c - y * s, x * s + y * c];
  }

  const scale = 1 + motion.pulse * Math.sin(TAU * phase);
  x /= scale;
  y /= scale;

  if (motion.wobble) {
    // Der Kreis im Rauschraum: nach einer Umrundung derselbe Wert.
    const cx = Math.cos(TAU * phase) * 1.7;
    const cy = Math.sin(TAU * phase) * 1.7;
    x += motion.wobble * (valueNoise(x * 2 + cx, y * 2 + cy) - 0.5);
    y += motion.wobble * (valueNoise(x * 2 + cx + 5.2, y * 2 + cy + 1.3) - 0.5);
  }

  return { point: [x, y], scale };
}

/** Bandverschiebung fuer eine Phase — in Baendern, nicht in Abstandseinheiten. */
export function driftBands(phase: number, motion: MotionSpec): number {
  return motion.drift * phase;
}

export const MOTION_GLSL = `
float fieldValueHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float fieldValueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = fieldValueHash(i);
  float b = fieldValueHash(i + vec2(1.0, 0.0));
  float c = fieldValueHash(i + vec2(0.0, 1.0));
  float d = fieldValueHash(i + vec2(1.0, 1.0));
  return a + (b - a) * u.x + (c - a) * u.y + (a - b - c + d) * u.x * u.y;
}

// Gibt den transformierten Punkt in xy und den Skalierungsfaktor in z zurueck.
vec3 fieldMotion(vec2 p, float phase, float spin, float pulse, float wobble) {
  const float TAU = 6.28318530718;

  if (spin != 0.0) {
    float angle = -spin * TAU * phase;
    float c = cos(angle);
    float s = sin(angle);
    p = vec2(p.x * c - p.y * s, p.x * s + p.y * c);
  }

  float scale = 1.0 + pulse * sin(TAU * phase);
  p /= scale;

  if (wobble > 0.0) {
    vec2 circle = vec2(cos(TAU * phase), sin(TAU * phase)) * 1.7;
    p.x += wobble * (fieldValueNoise(p * 2.0 + circle) - 0.5);
    p.y += wobble * (fieldValueNoise(p * 2.0 + circle + vec2(5.2, 1.3)) - 0.5);
  }

  return vec3(p, scale);
}
`;
