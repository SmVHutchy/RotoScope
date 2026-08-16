/**
 * Raster: Punkte, Bloecke, Dithering, Korn.
 *
 * In Referenzbild 7 und 8 ist das Raster **die Form**, nicht ein Hauch Textur
 * obendrauf — die Punkte tragen das ganze Bild. Im ersten Entwurf stand es unter
 * "Finish" und war damit zu klein gedacht (Spec §2).
 *
 * Das Raster liest die Helligkeit der eingefaerbten Flaeche: dunkle Baender geben
 * kleine Punkte, helle grosse. Damit folgt es dem Feld, ohne einen zweiten Kanal
 * durch die ganze Kette schleppen zu muessen.
 */

export type RasterMode = 'none' | 'dots' | 'blocks';

export type RasterSpec = {
  mode: RasterMode;
  /** Kantenlaenge einer Rasterzelle in Pixeln. */
  cell: number;
  /** Drehung des Rasters im Bogenmass — klassisch schraeg, damit es nicht flimmert. */
  angle: number;
  /** Staerke des Korns, 0 bis 1. */
  grain: number;
};

export const NO_RASTER: RasterSpec = { mode: 'none', cell: 8, angle: 0.4, grain: 0 };

export const RASTER_INDEX: Record<RasterMode, number> = { none: 0, dots: 1, blocks: 2 };

/** Wahrgenommene Helligkeit — steuert Punktgroesse und Dither-Schwelle. */
export function luminance(rgb: [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * Punktradius aus einem Helligkeitswert.
 *
 * Die Wurzel ist nicht Kosmetik: die *Flaeche* eines Punktes soll der Helligkeit
 * entsprechen, und die waechst quadratisch mit dem Radius. Ohne sie wirken
 * Mitteltoene deutlich zu dunkel — der klassische Fehler beim Halbton.
 */
export function dotRadius(value: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, value))) * 0.5;
}

/** Geordnete Bayer-Matrix 4x4, Werte 0 bis 1. Grundlage des Blockditherings. */
const BAYER = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export function bayer4(x: number, y: number): number {
  const col = ((x % 4) + 4) % 4;
  const row = ((y % 4) + 4) % 4;
  return (BAYER[row][col] + 0.5) / 16;
}

export const RASTER_GLSL = `
float fieldLuminance(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

float fieldBayer(vec2 cell) {
  // Dieselbe Matrix wie in der TypeScript-Referenz, ohne Array-Indizierung:
  // GLSL ES 1.00 kann Arrays nur mit Konstanten adressieren.
  vec2 c = mod(floor(cell), 4.0);
  float i = c.y * 4.0 + c.x;
  float v = 0.0;
  if (i < 0.5) v = 0.0;       else if (i < 1.5) v = 8.0;
  else if (i < 2.5) v = 2.0;  else if (i < 3.5) v = 10.0;
  else if (i < 4.5) v = 12.0; else if (i < 5.5) v = 4.0;
  else if (i < 6.5) v = 14.0; else if (i < 7.5) v = 6.0;
  else if (i < 8.5) v = 3.0;  else if (i < 9.5) v = 11.0;
  else if (i < 10.5) v = 1.0; else if (i < 11.5) v = 9.0;
  else if (i < 12.5) v = 15.0; else if (i < 13.5) v = 7.0;
  else if (i < 14.5) v = 13.0; else v = 5.0;
  return (v + 0.5) / 16.0;
}

float fieldHash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

vec3 fieldRaster(vec3 colour, vec3 background, vec2 fragCoord,
                 int mode, float cell, float angle, float grain) {
  vec3 out_ = colour;

  if (mode != 0) {
    float c = cos(angle);
    float s = sin(angle);
    vec2 rotated = vec2(fragCoord.x * c - fragCoord.y * s, fragCoord.x * s + fragCoord.y * c);
    vec2 grid = rotated / max(1.0, cell);
    float value = fieldLuminance(colour);

    if (mode == 1) {
      vec2 offset = fract(grid) - 0.5;
      float radius = sqrt(clamp(value, 0.0, 1.0)) * 0.5;
      float d = length(offset) - radius;
      // Feste Kantenbreite treppt bei kleinen Zellen; die Ableitung passt sich an.
      float edge = max(fwidth(d), 0.004);
      float coverage = 1.0 - smoothstep(-edge, edge, d);
      out_ = mix(background, colour, coverage);
    } else {
      out_ = value > fieldBayer(grid) ? colour : background;
    }
  }

  if (grain > 0.0) {
    out_ += (fieldHash(fragCoord) - 0.5) * grain;
  }
  return clamp(out_, 0.0, 1.0);
}
`;
