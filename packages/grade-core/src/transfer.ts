/**
 * Farbtransfer: die Farbwelt eines Referenzbildes auf eigenes Material legen.
 *
 * Zwei Verfahren, bewusst beide:
 *
 * - **Reinhard** verschiebt Mittelwert und Streuung je Achse getrennt. Robust,
 *   vorhersagbar, ignoriert aber die Kopplung zwischen den Achsen — ein Look, der
 *   im Wesentlichen aus einer Farbdrift besteht, kommt damit gut herüber.
 * - **MKL** (Monge-Kantorovich, linear) bildet die ganze Kovarianz ab und trifft
 *   damit auch gekippte Farbwolken, wie sie Splittoning erzeugt. Dafür reagiert es
 *   empfindlicher auf Ausreißer.
 *
 * Der Mischregler interpoliert die **Parameter**, nicht das Endbild: 50 % Look soll
 * aussehen wie ein halb so starker Grade, nicht wie ein halbtransparenter Filter.
 */

import { rgbToLab, labToRgb, type Rgb } from './color.ts';
import { analyse, matrixPower, multiply, transform, type Cloud, type Mat3, type Vec3 } from './stats.ts';

export type Method = 'reinhard' | 'mkl';

export type Look = {
  method: Method;
  source: Cloud;
  target: Cloud;
  /** Nur bei MKL belegt: die lineare Abbildung im Lab-Raum. */
  matrix?: Mat3;
};

const identity: Mat3 = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

/** Bildpunkte zu Lab-Stichproben. `stride` überspringt Pixel — 1 Mio. Punkte braucht niemand. */
export function sampleLab(pixels: Uint8ClampedArray, stride = 4): Vec3[] {
  const samples: Vec3[] = [];
  for (let i = 0; i < pixels.length; i += 4 * stride) {
    // Vollständig transparente Pixel tragen keine Farbe bei.
    if (pixels[i + 3] === 0) continue;
    samples.push(rgbToLab([pixels[i] / 255, pixels[i + 1] / 255, pixels[i + 2] / 255]));
  }
  return samples;
}

export function buildLook(sourceSamples: Vec3[], targetSamples: Vec3[], method: Method): Look {
  const source = analyse(sourceSamples);
  const target = analyse(targetSamples);
  if (method === 'reinhard') return { method, source, target };

  // T = Σs^-1/2 · (Σs^1/2 · Σt · Σs^1/2)^1/2 · Σs^-1/2
  const half = matrixPower(source.covariance, 0.5);
  const inverseHalf = matrixPower(source.covariance, -0.5);
  const middle = matrixPower(multiply(multiply(half, target.covariance), half), 0.5);
  return { method, source, target, matrix: multiply(multiply(inverseHalf, middle), inverseHalf) };
}

/** Einen Lab-Wert durch den Look schicken. `mix` interpoliert die Parameter. */
export function applyLab(look: Look, lab: Vec3, mix = 1): Vec3 {
  const { source, target } = look;

  if (look.method === 'reinhard') {
    const out: Vec3 = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      // Streuung und Mittelwert getrennt interpolieren: bei mix = 0 bleibt exakt
      // der Ausgangswert stehen, ohne Sonderfall im Code.
      const scale = 1 + mix * (safeRatio(target.deviation[i], source.deviation[i]) - 1);
      const shift = source.mean[i] + mix * (target.mean[i] - source.mean[i]);
      out[i] = (lab[i] - source.mean[i]) * scale + shift;
    }
    return out;
  }

  const matrix = look.matrix ?? identity;
  const blended: Mat3 = matrix.map((row, i) =>
    row.map((value, j) => identity[i][j] + mix * (value - identity[i][j])),
  );
  const centred: Vec3 = [lab[0] - source.mean[0], lab[1] - source.mean[1], lab[2] - source.mean[2]];
  const mapped = transform(blended, centred);
  return [
    mapped[0] + source.mean[0] + mix * (target.mean[0] - source.mean[0]),
    mapped[1] + source.mean[1] + mix * (target.mean[1] - source.mean[1]),
    mapped[2] + source.mean[2] + mix * (target.mean[2] - source.mean[2]),
  ];
}

/** Derselbe Look, aber in sRGB hinein und heraus. */
export function applyRgb(look: Look, rgb: Rgb, mix = 1): Rgb {
  return labToRgb(applyLab(look, rgbToLab(rgb), mix));
}

/** Eine Streuung von null bedeutet eine einfarbige Fläche — dann nicht skalieren. */
function safeRatio(numerator: number, denominator: number): number {
  return denominator < 1e-6 ? 1 : numerator / denominator;
}
