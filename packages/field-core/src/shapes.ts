/**
 * Abstandsfunktionen der Grundformen.
 *
 * Jede Form bringt zwei Fassungen mit: eine Referenz in TypeScript (testbar, liefert
 * spaeter die Werte fuer die SVG-Isolinien) und ein GLSL-Schnipsel (wird zum Shader
 * zusammengesetzt). Beide stammen aus derselben Definition -- das ist die Absicherung
 * dagegen, dass Vorschau und Vektorausgabe auseinanderlaufen (Spec §3).
 */

export type Vec2 = [number, number];

export type ShapeKind = 'superellipse' | 'capsule' | 'ring';

export type ShapeParams = {
  superellipse: { center: Vec2; size: Vec2; exponent: number; rotation: number };
  capsule: { a: Vec2; b: Vec2; radius: number };
  ring: { center: Vec2; radius: number; thickness: number };
};

function rotate(p: Vec2, angle: number): Vec2 {
  if (!angle) return p;
  const c = Math.cos(-angle);
  const s = Math.sin(-angle);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c];
}

/**
 * Superellipse: |x/a|^n + |y/b|^n = 1.
 *
 * Der Exponent faehrt von Raute (1) ueber Kreis (2) und Squircle (4) bis Quadrat --
 * eine Primitive deckt fast das ganze Formenspektrum der Referenzen ab (Spec §2).
 *
 * Es gibt keine geschlossene Loesung fuer den echten Abstand. Verwendet wird der
 * **radiale** Abstand: entlang des Strahls vom Mittelpunkt wird der Konturpunkt
 * bestimmt und dessen Entfernung abgezogen.
 *
 * Der naheliegende Weg -- implizite Funktion durch den Betrag ihres Gradienten --
 * war deutlich schlechter: er ist nur *auf* der Kontur exakt und lieferte fuer den
 * Kreis bei r=0.5 den Wert -0.75 statt -0.5. Bei Konturbaendern faellt so etwas
 * sofort auf, weil die Baender ungleich breit werden. Der radiale Abstand ist fuer
 * Kreise und auf den Achsen exakt und ueberschaetzt nur in den Ecken leicht.
 */
export function sdSuperellipse(point: Vec2, params: ShapeParams['superellipse']): number {
  const p = rotate([point[0] - params.center[0], point[1] - params.center[1]], params.rotation);
  const [a, b] = params.size;
  const n = Math.max(0.2, params.exponent);

  const length = Math.hypot(p[0], p[1]);
  if (length < 1e-9) return -Math.min(a, b);

  const ux = Math.abs(p[0]) / length;
  const uy = Math.abs(p[1]) / length;
  const radius = 1 / ((ux / a) ** n + (uy / b) ** n) ** (1 / n);
  return length - radius;
}

/** Kapsel: Strecke mit rundem Radius. Exakt. */
export function sdCapsule(point: Vec2, params: ShapeParams['capsule']): number {
  const [ax, ay] = params.a;
  const [bx, by] = params.b;
  const px = point[0] - ax;
  const py = point[1] - ay;
  const dx = bx - ax;
  const dy = by - ay;

  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared < 1e-9 ? 0 : Math.min(1, Math.max(0, (px * dx + py * dy) / lengthSquared));
  const cx = px - dx * t;
  const cy = py - dy * t;
  return Math.sqrt(cx * cx + cy * cy) - params.radius;
}

/** Ring: Kreisband um einen Mittelpunkt. Exakt. */
export function sdRing(point: Vec2, params: ShapeParams['ring']): number {
  const dx = point[0] - params.center[0];
  const dy = point[1] - params.center[1];
  return Math.abs(Math.sqrt(dx * dx + dy * dy) - params.radius) - params.thickness / 2;
}

export function evaluateShape<K extends ShapeKind>(
  kind: K,
  point: Vec2,
  params: ShapeParams[K],
): number {
  switch (kind) {
    case 'superellipse':
      return sdSuperellipse(point, params as ShapeParams['superellipse']);
    case 'capsule':
      return sdCapsule(point, params as ShapeParams['capsule']);
    case 'ring':
      return sdRing(point, params as ShapeParams['ring']);
    default:
      throw new Error(`Unbekannte Form: ${kind}`);
  }
}

/** Die GLSL-Fassungen. Muessen sich wie die TypeScript-Referenz oben verhalten. */
export const SHAPE_GLSL = `
vec2 fieldRotate(vec2 p, float angle) {
  float c = cos(-angle);
  float s = sin(-angle);
  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);
}

float sdSuperellipse(vec2 point, vec2 center, vec2 size, float exponent, float rotation) {
  vec2 p = fieldRotate(point - center, rotation);
  float n = max(0.2, exponent);
  float len = length(p);
  if (len < 1e-9) return -min(size.x, size.y);
  vec2 u = abs(p) / len;
  float radius = 1.0 / pow(pow(u.x / size.x, n) + pow(u.y / size.y, n), 1.0 / n);
  return len - radius;
}

float sdCapsule(vec2 point, vec2 a, vec2 b, float radius) {
  vec2 pa = point - a;
  vec2 ba = b - a;
  float denom = max(dot(ba, ba), 1e-9);
  float t = clamp(dot(pa, ba) / denom, 0.0, 1.0);
  return length(pa - ba * t) - radius;
}

float sdRing(vec2 point, vec2 center, float radius, float thickness) {
  return abs(length(point - center) - radius) - thickness * 0.5;
}
`;
