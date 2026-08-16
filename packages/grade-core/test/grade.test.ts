import assert from 'node:assert/strict';
import { test } from 'node:test';

import { labToRgb, rgbToLab, type Rgb } from '../src/color.ts';
import { analyse, matrixPower, multiply } from '../src/stats.ts';
import { applyRgb, buildLook, sampleLab } from '../src/transfer.ts';
import { bakeCube, parseCube, sampleCube, serializeCube } from '../src/cube.ts';
import { lookToCube } from '../src/index.ts';

/** Zufallsbild mit steuerbarer Farbdrift — statt echter Dateien im Test. */
function image(width: number, height: number, tint: Rgb, spread = 0.15, seed = 1): Uint8ClampedArray {
  let state = seed;
  const random = () => ((state = (state * 1103515245 + 12345) % 2147483648) / 2147483648);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 * Math.min(1, Math.max(0, tint[c] + (random() - 0.5) * spread)));
    data[i + 3] = 255;
  }
  return data;
}

test('Lab-Rundlauf trifft die Ausgangsfarbe', () => {
  for (const rgb of [[0.2, 0.4, 0.6], [0, 0, 0], [1, 1, 1], [0.9, 0.1, 0.35]] as Rgb[]) {
    const back = labToRgb(rgbToLab(rgb));
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(back[i] - rgb[i]) < 1e-6, `Kanal ${i}: ${back[i]} statt ${rgb[i]}`);
  }
});

test('Matrixwurzel mal sich selbst ergibt die Ausgangsmatrix', () => {
  const m = [
    [4, 1, 0.5],
    [1, 3, 0.2],
    [0.5, 0.2, 2],
  ];
  const root = matrixPower(m, 0.5);
  const squared = multiply(root, root);
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++) assert.ok(Math.abs(squared[i][j] - m[i][j]) < 1e-8);
});

test('Reinhard bringt Mittelwert und Streuung auf das Ziel', () => {
  const source = sampleLab(image(64, 64, [0.5, 0.5, 0.5]), 1);
  const target = sampleLab(image(64, 64, [0.25, 0.35, 0.6], 0.25, 7), 1);
  const look = buildLook(source, target, 'reinhard');

  const moved = analyse(source.map((lab) => rgbToLab(applyRgb(look, labToRgb(lab)))));
  for (let i = 0; i < 3; i++) {
    assert.ok(
      Math.abs(moved.mean[i] - look.target.mean[i]) < 1.5,
      `Achse ${i}: Mittelwert ${moved.mean[i].toFixed(2)} statt ${look.target.mean[i].toFixed(2)}`,
    );
  }
});

test('MKL bildet auch die Kovarianz ab', () => {
  const source = sampleLab(image(64, 64, [0.5, 0.5, 0.5], 0.3), 1);
  const target = sampleLab(image(64, 64, [0.3, 0.4, 0.55], 0.18, 11), 1);
  const look = buildLook(source, target, 'mkl');
  assert.ok(look.matrix, 'MKL muss eine Matrix liefern');

  const moved = analyse(source.map((lab) => rgbToLab(applyRgb(look, labToRgb(lab)))));
  // Die Diagonale der Kovarianz muss näher am Ziel liegen als vorher.
  for (let i = 0; i < 3; i++) {
    const vorher = Math.abs(look.source.covariance[i][i] - look.target.covariance[i][i]);
    const nachher = Math.abs(moved.covariance[i][i] - look.target.covariance[i][i]);
    assert.ok(nachher <= vorher, `Achse ${i}: ${nachher.toFixed(3)} nicht besser als ${vorher.toFixed(3)}`);
  }
});

test('mix = 0 lässt das Bild unverändert', () => {
  const source = sampleLab(image(32, 32, [0.5, 0.5, 0.5]), 1);
  const target = sampleLab(image(32, 32, [0.1, 0.6, 0.8], 0.2, 3), 1);

  for (const method of ['reinhard', 'mkl'] as const) {
    const look = buildLook(source, target, method);
    const rgb: Rgb = [0.4, 0.55, 0.7];
    const out = applyRgb(look, rgb, 0);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(out[i] - rgb[i]) < 1e-6, `${method}, Kanal ${i}`);
  }
});

test('mix liegt zwischen unverändert und voll', () => {
  const source = sampleLab(image(32, 32, [0.5, 0.5, 0.5]), 1);
  const target = sampleLab(image(32, 32, [0.15, 0.3, 0.7], 0.2, 5), 1);
  const look = buildLook(source, target, 'reinhard');
  const rgb: Rgb = [0.5, 0.5, 0.5];

  const halb = applyRgb(look, rgb, 0.5);
  const voll = applyRgb(look, rgb, 1);
  for (let i = 0; i < 3; i++) {
    const min = Math.min(rgb[i], voll[i]);
    const max = Math.max(rgb[i], voll[i]);
    assert.ok(halb[i] >= min - 1e-6 && halb[i] <= max + 1e-6, `Kanal ${i} außerhalb`);
  }
});

test('Identitäts-LUT bildet auf sich selbst ab', () => {
  const lut = bakeCube((rgb) => rgb, 17);
  for (const rgb of [[0.2, 0.4, 0.6], [0.81, 0.13, 0.5]] as Rgb[]) {
    const out = sampleCube(lut, rgb);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(out[i] - rgb[i]) < 1e-6);
  }
});

test('.cube wird geschrieben und wieder gelesen', () => {
  const source = sampleLab(image(32, 32, [0.5, 0.5, 0.5]), 1);
  const target = sampleLab(image(32, 32, [0.2, 0.35, 0.62], 0.2, 9), 1);
  const look = buildLook(source, target, 'mkl');

  const lut = lookToCube(look, 1, 17, 'Testlook');
  const text = serializeCube(lut);
  const zurueck = parseCube(text);

  assert.equal(zurueck.size, 17);
  assert.equal(zurueck.entries.length, 17 ** 3);
  assert.equal(zurueck.title, 'Testlook');
  assert.match(text, /LUT_3D_SIZE 17/);

  // Das gebackene LUT muss dieselbe Abbildung liefern wie der Look direkt.
  for (const rgb of [[0.3, 0.5, 0.7], [0.65, 0.2, 0.45]] as Rgb[]) {
    const direkt = applyRgb(look, rgb);
    const ueberLut = sampleCube(zurueck, rgb);
    for (let i = 0; i < 3; i++) {
      assert.ok(
        Math.abs(direkt[i] - ueberLut[i]) < 0.02,
        `Kanal ${i}: LUT ${ueberLut[i].toFixed(3)} gegen direkt ${direkt[i].toFixed(3)}`,
      );
    }
  }
});

test('kaputtes .cube wird gemeldet, nicht stillschweigend akzeptiert', () => {
  assert.throws(() => parseCube('0.1 0.2 0.3\n'), /LUT_3D_SIZE fehlt/);
  assert.throws(() => parseCube('LUT_3D_SIZE 2\n0.1 0.2 0.3\n'), /Einträge, erwartet 8/);
});

test('einfarbige Quelle degeneriert ruhig statt NaN zu liefern', () => {
  const flat = sampleLab(image(16, 16, [0.5, 0.5, 0.5], 0), 1);
  const target = sampleLab(image(16, 16, [0.2, 0.4, 0.6], 0.2, 13), 1);
  const out = applyRgb(buildLook(flat, target, 'mkl'), [0.5, 0.5, 0.5]);
  assert.ok(out.every(Number.isFinite), 'kein NaN');
});
