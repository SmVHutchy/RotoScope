/**
 * Farbraum-Umrechnungen.
 *
 * Der Transfer rechnet in CIELAB, nicht in sRGB: dort entsprechen gleiche Abstände
 * ungefähr gleichen wahrgenommenen Unterschieden, und Helligkeit ist von Farbigkeit
 * getrennt. Verschiebt man Statistiken direkt in sRGB, wandert mit jeder Sättigungs-
 * änderung auch die Helligkeit mit.
 *
 * Verfahren nach Reinhard et al. und Pitié/Kokaram (MKL) — selbst implementiert,
 * nicht aus color-matcher übernommen (GPL-3.0, siehe docs/licenses/README.md).
 */

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

/** sRGB-Übertragungsfunktion (IEC 61966-2-1), Eingabe und Ausgabe 0..1. */
export function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

// sRGB-Primärvalenzen mit Weißpunkt D65.
const RGB_TO_XYZ = [
  [0.4124564, 0.3575761, 0.1804375],
  [0.2126729, 0.7151522, 0.072175],
  [0.0193339, 0.119192, 0.9503041],
];

const XYZ_TO_RGB = [
  [3.2404542, -1.5371385, -0.4985314],
  [-0.969266, 1.8760108, 0.041556],
  [0.0556434, -0.2040259, 1.0572252],
];

const WHITE: Rgb = [0.95047, 1.0, 1.08883];
const EPSILON = 216 / 24389;
const KAPPA = 24389 / 27;

function apply(matrix: number[][], v: Rgb): Rgb {
  return [
    matrix[0][0] * v[0] + matrix[0][1] * v[1] + matrix[0][2] * v[2],
    matrix[1][0] * v[0] + matrix[1][1] * v[1] + matrix[1][2] * v[2],
    matrix[2][0] * v[0] + matrix[2][1] * v[1] + matrix[2][2] * v[2],
  ];
}

const f = (t: number) => (t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116);
const fInverse = (t: number) => (t ** 3 > EPSILON ? t ** 3 : (116 * t - 16) / KAPPA);

export function rgbToLab(rgb: Rgb): Lab {
  const linear: Rgb = [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
  const [x, y, z] = apply(RGB_TO_XYZ, linear);
  const [fx, fy, fz] = [f(x / WHITE[0]), f(y / WHITE[1]), f(z / WHITE[2])];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function labToRgb(lab: Lab): Rgb {
  const fy = (lab[0] + 16) / 116;
  const fx = fy + lab[1] / 500;
  const fz = fy - lab[2] / 200;

  const xyz: Rgb = [
    fInverse(fx) * WHITE[0],
    fInverse(fy) * WHITE[1],
    fInverse(fz) * WHITE[2],
  ];
  const linear = apply(XYZ_TO_RGB, xyz);
  return [
    clamp01(linearToSrgb(linear[0])),
    clamp01(linearToSrgb(linear[1])),
    clamp01(linearToSrgb(linear[2])),
  ];
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
