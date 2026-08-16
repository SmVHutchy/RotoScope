import assert from 'node:assert/strict';
import { test } from 'node:test';

import { sdCapsule, sdRing, sdSuperellipse } from '../src/shapes.ts';
import { combine, mirror, sampleRings, smoothUnion } from '../src/field.ts';
import { PRESETS, presetByName, sampleRamp, bakeRamp } from '../src/palette.ts';
import { evaluateField, packShapes, shadeField, MAX_SHAPES, type FieldGraph } from '../src/graph.ts';
import { FIELD_PRESETS, fieldPresetByName } from '../src/presets.ts';
import { rgbToLab } from '@rotoscope/grade-core';

test('Superellipse faehrt von Raute ueber Kreis zum Quadrat', () => {
  const base = { center: [0, 0] as [number, number], size: [1, 1] as [number, number], rotation: 0 };

  // Auf den Achsen liegt die Kontur bei allen Exponenten auf 1.
  for (const exponent of [1, 2, 4, 8]) {
    assert.ok(Math.abs(sdSuperellipse([1, 0], { ...base, exponent })) < 1e-6, `Exponent ${exponent}`);
  }

  // Auf der Diagonalen unterscheiden sie sich: Raute innen, Quadrat aussen.
  const diagonal: [number, number] = [0.7, 0.7];
  const raute = sdSuperellipse(diagonal, { ...base, exponent: 1 });
  const kreis = sdSuperellipse(diagonal, { ...base, exponent: 2 });
  const quadrat = sdSuperellipse(diagonal, { ...base, exponent: 8 });
  assert.ok(raute > 0, 'Raute: Punkt liegt aussen');
  assert.ok(quadrat < 0, 'Quadrat: Punkt liegt innen');
  assert.ok(raute > kreis && kreis > quadrat, 'Reihenfolge Raute > Kreis > Quadrat');
});

test('Kreis-Superellipse stimmt mit dem echten Abstand ueberein', () => {
  const params = { center: [0, 0] as [number, number], size: [1, 1] as [number, number], exponent: 2, rotation: 0 };
  for (const r of [0.5, 1, 1.5]) {
    const d = sdSuperellipse([r, 0], params);
    assert.ok(Math.abs(d - (r - 1)) < 1e-6, `bei r=${r}: ${d}`);
  }
});

test('Drehung verschiebt die Kontur wie erwartet', () => {
  const params = { center: [0, 0] as [number, number], size: [1, 0.25] as [number, number], exponent: 2, rotation: Math.PI / 2 };
  // Um 90 Grad gedreht liegt die lange Achse senkrecht.
  assert.ok(sdSuperellipse([0, 0.9], params) < 0, 'senkrecht innen');
  assert.ok(sdSuperellipse([0.9, 0], params) > 0, 'waagerecht aussen');
});

test('Kapsel und Ring sind exakt', () => {
  const capsule = { a: [-1, 0] as [number, number], b: [1, 0] as [number, number], radius: 0.25 };
  assert.ok(Math.abs(sdCapsule([0, 0.25], capsule)) < 1e-9, 'auf der Kontur');
  assert.ok(Math.abs(sdCapsule([0, 0.75], capsule) - 0.5) < 1e-9, 'halb ausserhalb');
  assert.ok(Math.abs(sdCapsule([2, 0], capsule) - 0.75) < 1e-9, 'hinter der Kappe');

  const ring = { center: [0, 0] as [number, number], radius: 1, thickness: 0.2 };
  assert.ok(Math.abs(sdRing([1, 0], ring) + 0.1) < 1e-9, 'Mitte des Bandes');
  assert.ok(Math.abs(sdRing([0, 0], ring) - 0.9) < 1e-9, 'im Loch');
});

test('Verknuepfungen verhalten sich wie erwartet', () => {
  assert.equal(combine('union', -1, 2), -1);
  assert.equal(combine('subtract', -1, -2), 2);
  assert.equal(combine('intersect', -1, 2), 2);

  // smooth-min liegt unter dem Minimum -- genau das erzeugt die Verschmelzung.
  const glatt = smoothUnion(0.1, 0.1, 0.5);
  assert.ok(glatt < Math.min(0.1, 0.1), `smooth ${glatt} muss unter dem Minimum liegen`);
  // Ohne Breite ist es exakt das Minimum: der Rohrkreuzungs-Fall aus Bild 2.
  assert.equal(smoothUnion(0.3, 0.7, 0), 0.3);
});

test('Spiegelung klappt die Ebene', () => {
  assert.deepEqual(mirror([-2, 3], 'x'), [2, 3]);
  assert.deepEqual(mirror([-2, -3], 'both'), [2, 3]);
  assert.deepEqual(mirror([-2, -3], 'none'), [-2, -3]);
});

test('Ringrhythmus: die Kurve macht die Abstaende ungleichmaessig', () => {
  const gleich = { spacing: 0.1, curve: 1, hardness: 1, line: 0, stagger: 0 };
  // Bei curve = 1 liegt jede Bandgrenze auf einem Vielfachen des Abstands.
  assert.equal(sampleRings(0.05, gleich).index, 0);
  assert.equal(sampleRings(0.15, gleich).index, 1);
  assert.equal(sampleRings(0.25, gleich).index, 2);

  // curve > 1 draengt die Baender nach aussen zusammen (Referenzbild 5): bei gleichem
  // Abstand liegt der Index dann hoeher. curve < 1 spreizt sie auf.
  const dicht = sampleRings(0.55, { ...gleich, curve: 1.6 }).index;
  const normal = sampleRings(0.55, gleich).index;
  const weit = sampleRings(0.55, { ...gleich, curve: 0.6 }).index;
  assert.ok(dicht > normal, `aussen dichter: ${dicht} > ${normal}`);
  assert.ok(weit < normal, `aussen weiter: ${weit} < ${normal}`);
});

test('Trennlinie sitzt an der Bandgrenze', () => {
  const profile = { spacing: 1, curve: 1, hardness: 1, line: 0.2, stagger: 0 };
  assert.ok(sampleRings(0.02, profile).separator > 0.5, 'direkt an der Grenze');
  assert.ok(sampleRings(0.5, profile).separator < 0.5, 'in der Bandmitte');
});

test('Palette interpoliert in Lab, nicht in sRGB', () => {
  const rot: [number, number, number] = [1, 0, 0];
  const gelb: [number, number, number] = [1, 1, 0];
  const mitte = sampleRamp([rot, gelb], 0.5);

  // Der sRGB-Mittelwert waere [1, 0.5, 0] -- deutlich dunkler und stumpfer.
  const naiv: [number, number, number] = [1, 0.5, 0];
  assert.ok(rgbToLab(mitte)[0] > rgbToLab(naiv)[0], 'Lab-Mischung ist heller');
});

test('Rampenenden werden exakt getroffen', () => {
  const stops: [number, number, number][] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const [t, erwartet] of [[0, stops[0]], [1, stops[2]]] as const) {
    const out = sampleRamp(stops, t);
    // Toleranz 1e-5: der Weg durch Lab und zurueck kostet bei gesaettigten
    // Grundfarben rund 2e-6 Genauigkeit — das ist Gleitkomma, kein Fehler.
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(out[i] - erwartet[i]) < 1e-5);
  }
});

test('gebackene Rampe hat die richtige Groesse und Endfarben', () => {
  const data = bakeRamp([[1, 0, 0], [0, 0, 1]], 64);
  assert.equal(data.length, 64 * 4);
  assert.ok(data[0] > 200 && data[2] < 60, 'Anfang ist rot');
  assert.ok(data[63 * 4] < 60 && data[63 * 4 + 2] > 200, 'Ende ist blau');
});

test('jedes Palette-Preset ist vollstaendig', () => {
  for (const preset of PRESETS) {
    assert.ok(preset.stops.length >= 1, `${preset.name} ohne Farben`);
    assert.ok(['distance', 'index'].includes(preset.source), `${preset.name} ohne Quelle`);
    assert.equal(presetByName(preset.name).name, preset.name);
  }
  // Das Merkmal aus der Analyse: genau eines liest den Kopienindex (Bild 3).
  assert.equal(PRESETS.filter((p) => p.source === 'index').length, 1);
});

test('Feld kombiniert mehrere Formen', () => {
  const graph = fieldPresetByName('Amoebe').graph;
  // Zwischen den beiden Lappen zieht smooth-min das Feld nach innen.
  assert.ok(evaluateField(graph, [0, 0]) < 0, 'Mitte liegt innen');
  assert.ok(evaluateField(graph, [2, 2]) > 0, 'weit draussen liegt aussen');
});

test('Formen werden fuer den Shader gepackt', () => {
  const graph = fieldPresetByName('Neon').graph;
  const packed = packShapes(graph);
  assert.equal(packed.count, 2);
  assert.equal(packed.a.length, MAX_SHAPES * 4);
  assert.equal(packed.kinds[0], 1, 'Kapsel hat Index 1');
  // Float32Array rundet: mit Toleranz vergleichen, nicht auf Gleichheit.
  assert.ok(Math.abs(packed.a[2] - graph.shapes[0].size[0]) < 1e-6, 'Laenge landet in a.z');
});

test('Obergrenze wird eingehalten', () => {
  const graph: FieldGraph = {
    ...fieldPresetByName('Club').graph,
    shapes: Array.from({ length: 30 }, () => fieldPresetByName('Club').graph.shapes[0]),
  };
  assert.equal(packShapes(graph).count, MAX_SHAPES);
});

test('Einfaerbung liefert gueltige Farben, innen wie aussen', () => {
  for (const preset of FIELD_PRESETS) {
    for (const point of [[0, 0], [0.5, 0.2], [3, 3]] as [number, number][]) {
      const rgb = shadeField(preset.graph, point);
      assert.equal(rgb.length, 3, preset.name);
      assert.ok(rgb.every((c) => Number.isFinite(c) && c >= 0 && c <= 1), `${preset.name} bei ${point}`);
    }
  }
});

test('ohne Leuchten ist weit draussen exakt der Hintergrund', () => {
  const graph = fieldPresetByName('Amoebe').graph;
  assert.equal(graph.glow, 0);
  const rgb = shadeField(graph, [5, 5]);
  const bg = graph.palette.background as [number, number, number];
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(rgb[i] - bg[i]) < 1e-9);
});

test('Repeater versetzt, skaliert und liefert den Kopienindex', async () => {
  const { copyTransform, copyCount, MAX_COPIES } = await import('../src/repeat.ts');

  const repeat = { count: 4, offset: [0, -0.5] as [number, number], scale: 0.9, rotation: 0 };
  // Kopie 0 ist unveraendert.
  const erste = copyTransform([0.3, 0.2], 0, repeat);
  assert.deepEqual(erste.point, [0.3, 0.2]);
  assert.equal(erste.factor, 1);

  // Kopie 2 ist zweimal versetzt und zweimal geschrumpft.
  const dritte = copyTransform([0, -1], 2, repeat);
  assert.ok(Math.abs(dritte.factor - 0.81) < 1e-9, 'Faktor ist scale hoch Kopie');
  assert.ok(Math.abs(dritte.point[1] - 0) < 1e-9, 'Versatz herausgerechnet');

  assert.equal(copyCount({ ...repeat, count: 99 }), MAX_COPIES, 'Obergrenze greift');
  assert.equal(copyCount({ ...repeat, count: 0 }), 1, 'mindestens eine Kopie');
});

test('Stapel-Preset faerbt ueber den Kopienindex, nicht ueber den Abstand', async () => {
  const { evaluateFieldWithCopy } = await import('../src/graph.ts');
  const graph = fieldPresetByName('Stapel').graph;

  assert.equal(graph.palette.source, 'index');
  assert.ok(graph.repeat.count > 1, 'mehrere Kopien');

  // Oben liegt die erste Kopie, weiter unten eine spaetere.
  const oben = evaluateFieldWithCopy(graph, [0, 0.55]);
  const unten = evaluateFieldWithCopy(graph, [0, -0.4]);
  assert.equal(oben.copy, 0, 'oben ist Kopie 0');
  assert.ok(unten.copy > oben.copy, `unten liegt eine spaetere Kopie: ${unten.copy}`);

  // Und die Farbe unterscheidet sich, weil die Rampe den Index liest.
  const farbeOben = shadeField(graph, [0, 0.55]);
  const farbeUnten = shadeField(graph, [0, -0.4]);
  assert.notDeepEqual(farbeOben, farbeUnten);
});
