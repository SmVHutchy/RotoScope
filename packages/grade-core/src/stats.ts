/**
 * Statistik über Farbwolken: Mittelwert, Kovarianz, Matrixwurzel.
 *
 * Die Matrixwurzel ist der Kern des MKL-Transfers. Für symmetrische 3x3-Matrizen
 * ist das Jacobi-Verfahren die einfachste zuverlässige Wahl -- klein genug, um es
 * zu lesen, und ohne Abhängigkeit von einer Lineare-Algebra-Bibliothek.
 */

export type Vec3 = [number, number, number];
export type Mat3 = number[][];

export type Cloud = {
  mean: Vec3;
  covariance: Mat3;
  /** Standardabweichung je Achse — für den einfachen Reinhard-Transfer. */
  deviation: Vec3;
  count: number;
};

export function analyse(samples: Vec3[]): Cloud {
  if (!samples.length) throw new Error('Leere Stichprobe.');

  const mean: Vec3 = [0, 0, 0];
  for (const sample of samples) {
    mean[0] += sample[0];
    mean[1] += sample[1];
    mean[2] += sample[2];
  }
  mean[0] /= samples.length;
  mean[1] /= samples.length;
  mean[2] /= samples.length;

  const covariance: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const sample of samples) {
    const d = [sample[0] - mean[0], sample[1] - mean[1], sample[2] - mean[2]];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) covariance[i][j] += d[i] * d[j];
  }
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) covariance[i][j] /= samples.length;

  return {
    mean,
    covariance,
    deviation: [
      Math.sqrt(covariance[0][0]),
      Math.sqrt(covariance[1][1]),
      Math.sqrt(covariance[2][2]),
    ],
    count: samples.length,
  };
}

export function multiply(a: Mat3, b: Mat3): Mat3 {
  const out: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) out[i][j] += a[i][k] * b[k][j];
  return out;
}

export function transform(matrix: Mat3, v: Vec3): Vec3 {
  return [
    matrix[0][0] * v[0] + matrix[0][1] * v[1] + matrix[0][2] * v[2],
    matrix[1][0] * v[0] + matrix[1][1] * v[1] + matrix[1][2] * v[2],
    matrix[2][0] * v[0] + matrix[2][1] * v[1] + matrix[2][2] * v[2],
  ];
}

/** Eigenzerlegung einer symmetrischen 3x3-Matrix (Jacobi-Rotationen). */
export function eigen(input: Mat3): { values: Vec3; vectors: Mat3 } {
  const a = input.map((row) => [...row]);
  let v: Mat3 = [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ];

  for (let sweep = 0; sweep < 32; sweep++) {
    const off = Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]);
    if (off < 1e-14) break;

    for (const [p, q] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      if (Math.abs(a[p][q]) < 1e-18) continue;

      const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1);
      const s = t * c;

      const rotation: Mat3 = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      rotation[p][p] = c;
      rotation[q][q] = c;
      rotation[p][q] = s;
      rotation[q][p] = -s;

      const rt = rotation[0].map((_, i) => rotation.map((row) => row[i]));
      Object.assign(a, multiply(multiply(rt, a), rotation));
      v = multiply(v, rotation);
    }
  }

  return { values: [a[0][0], a[1][1], a[2][2]], vectors: v };
}

/**
 * Symmetrische Matrixwurzel bzw. inverse Wurzel über die Eigenzerlegung.
 *
 * Negative Eigenwerte entstehen nur numerisch bei fast entarteten Wolken (etwa
 * einem einfarbigen Bild); sie werden auf null gesetzt, damit der Transfer dort
 * ruhig degeneriert statt NaN zu liefern.
 */
export function matrixPower(matrix: Mat3, exponent: 0.5 | -0.5): Mat3 {
  const { values, vectors } = eigen(matrix);
  const diagonal: Mat3 = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (let i = 0; i < 3; i++) {
    const value = Math.max(values[i], 0);
    diagonal[i][i] = value < 1e-12 ? 0 : value ** exponent;
  }
  const vt = vectors[0].map((_, i) => vectors.map((row) => row[i]));
  return multiply(multiply(vectors, diagonal), vt);
}
