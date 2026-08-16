/**
 * Der Repeater: N Kopien einer Form, je versetzt, skaliert und gedreht.
 *
 * Referenzbild 3 ist **keine** Konturbaenderung, sondern ein Stapel — eine Ellipse,
 * vielfach versetzt, mit wandernder Farbe. Konturbaender erzeugen Ringe *in der
 * Flaeche*, hier staffelt sich eine Form *in die Tiefe*. Das ist ein anderer
 * Mechanismus, und er hat im ersten Entwurf gefehlt (Spec §2).
 *
 * Jede Kopie bekommt einen Index, den die Palette lesen kann — daher stammt der
 * Farbverlauf ueber den Stapel statt ueber den Abstand.
 */

import type { Vec2 } from './shapes.ts';

/** Obergrenze; die Shader-Kosten sind Kopien mal Formen. */
export const MAX_COPIES = 24;

export type RepeatSpec = {
  count: number;
  /** Versatz je Kopie. */
  offset: Vec2;
  /** Groessenfaktor je Kopie; 1 laesst die Groesse gleich. */
  scale: number;
  /** Drehung je Kopie, im Bogenmass. */
  rotation: number;
};

export const NO_REPEAT: RepeatSpec = { count: 1, offset: [0, 0], scale: 1, rotation: 0 };

/**
 * Den Punkt in das Bezugssystem einer Kopie zuruecktransformieren.
 *
 * Nicht die Form wird bewegt, sondern der Abtastpunkt entgegengesetzt — das ist bei
 * Abstandsfeldern der uebliche Weg und spart es, jede Form zu vervielfaeltigen.
 * Der Rueckgabewert `factor` korrigiert den Abstand um die Skalierung; ohne ihn
 * waeren die Baender auf geschrumpften Kopien zu breit.
 */
export function copyTransform(point: Vec2, copy: number, repeat: RepeatSpec): {
  point: Vec2;
  factor: number;
} {
  const factor = repeat.scale ** copy;
  const shifted: Vec2 = [
    point[0] - repeat.offset[0] * copy,
    point[1] - repeat.offset[1] * copy,
  ];

  const angle = -repeat.rotation * copy;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotated: Vec2 = [shifted[0] * c - shifted[1] * s, shifted[0] * s + shifted[1] * c];

  return { point: [rotated[0] / factor, rotated[1] / factor], factor };
}

export function copyCount(repeat: RepeatSpec): number {
  return Math.max(1, Math.min(MAX_COPIES, Math.round(repeat.count)));
}

export const REPEAT_GLSL = `
// Gibt den zurueckgerechneten Punkt in xy und den Skalierungsfaktor in z zurueck.
vec3 fieldCopyTransform(vec2 point, float copy, vec2 offset, float scale, float rotation) {
  float factor = pow(scale, copy);
  vec2 shifted = point - offset * copy;
  float angle = -rotation * copy;
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotated = vec2(shifted.x * c - shifted.y * s, shifted.x * s + shifted.y * c);
  return vec3(rotated / factor, factor);
}
`;
