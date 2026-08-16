/**
 * Der Feldgraph: Datenmodell, TypeScript-Referenz und der Shader.
 *
 * **Abweichung von der Spec, und zwar eine gute:** Die Spec sah einen Codegen vor,
 * der aus dem Graphen GLSL erzeugt. Sobald aber die Regel "jeder Wert ist ein Uniform"
 * konsequent gilt, ist der Shader fuer Stufe 1 **statisch** -- Formen liegen in
 * Uniform-Arrays, die Anzahl in einem Zaehler, die Verknuepfung in einem Integer.
 * Damit entfaellt das groesste Risiko aus Spec §12 (Shader-Uebersetzung im Bedienweg)
 * ersatzlos. Codegen wird erst gebraucht, wenn Graphen beliebig verzweigen duerfen.
 */

import { combine, mirror, sampleRings, type CombineMode, type RingProfile } from './field.ts';
import { evaluateShape, type ShapeKind, type Vec2 } from './shapes.ts';
import { sampleRamp, type PalettePreset } from './palette.ts';
import { copyCount, copyTransform, NO_REPEAT, type RepeatSpec } from './repeat.ts';
import type { Rgb } from '@rotoscope/grade-core';

/** Obergrenze aus Spec §4 — begrenzt durch die Uniform-Kapazitaet von WebGL2. */
export const MAX_SHAPES = 16;

export type MirrorAxis = 'none' | 'x' | 'y' | 'both';

export type ShapeNode = {
  kind: ShapeKind;
  center: Vec2;
  /** Superellipse: Halbachsen. Kapsel: Laenge in x, Radius in y. Ring: Radius, Dicke. */
  size: Vec2;
  exponent: number;
  rotation: number;
};

export type FieldGraph = {
  shapes: ShapeNode[];
  combineMode: CombineMode;
  smoothness: number;
  mirrorAxis: MirrorAxis;
  rings: RingProfile;
  palette: PalettePreset;
  /** Weiches Leuchten nach aussen, 0 bis 1 (Referenzbild 1 und 4). */
  glow: number;
  /** Vervielfaeltigung der Formen (Referenzbild 3). */
  repeat: RepeatSpec;
};

/** Formparameter aus der einheitlichen Darstellung ableiten. */
function paramsOf(shape: ShapeNode) {
  switch (shape.kind) {
    case 'superellipse':
      return {
        center: shape.center,
        size: shape.size,
        exponent: shape.exponent,
        rotation: shape.rotation,
      };
    case 'capsule': {
      // Laenge und Winkel in Endpunkte umrechnen, damit die Bedienung nur einen
      // Mittelpunkt und eine Drehung braucht statt zweier freier Punkte.
      const half = shape.size[0] / 2;
      const dx = Math.cos(shape.rotation) * half;
      const dy = Math.sin(shape.rotation) * half;
      return {
        a: [shape.center[0] - dx, shape.center[1] - dy] as Vec2,
        b: [shape.center[0] + dx, shape.center[1] + dy] as Vec2,
        radius: shape.size[1],
      };
    }
    case 'ring':
      return { center: shape.center, radius: shape.size[0], thickness: shape.size[1] };
  }
}

/** Abstand aller Formen an einem Punkt, ohne Vervielfaeltigung. */
function combinedShapes(graph: FieldGraph, p: Vec2): number {
  let distance = evaluateShape(graph.shapes[0].kind, p, paramsOf(graph.shapes[0]) as never);
  for (let i = 1; i < Math.min(graph.shapes.length, MAX_SHAPES); i++) {
    const shape = graph.shapes[i];
    const next = evaluateShape(shape.kind, p, paramsOf(shape) as never);
    distance = combine(graph.combineMode, distance, next, graph.smoothness);
  }
  return distance;
}

/**
 * Abstand zum Feld und die naechstgelegene Kopie.
 *
 * Der Kopienindex faellt hier mit ab, weil die Palette ihn lesen kann — nachtraeglich
 * ermitteln hiesse, dieselbe Schleife ein zweites Mal zu laufen.
 */
export function evaluateFieldWithCopy(
  graph: FieldGraph,
  point: Vec2,
): { distance: number; copy: number } {
  if (!graph.shapes.length) return { distance: Number.POSITIVE_INFINITY, copy: 0 };

  const p = mirror(point, graph.mirrorAxis);
  const repeat = graph.repeat ?? NO_REPEAT;
  const copies = copyCount(repeat);

  let distance = Number.POSITIVE_INFINITY;
  let copy = 0;

  for (let c = 0; c < copies; c++) {
    const transformed = copyTransform(p, c, repeat);
    // Der Faktor rechnet den Abstand aus dem geschrumpften Bezugssystem zurueck.
    const d = combinedShapes(graph, transformed.point) * transformed.factor;
    if (d < distance) {
      distance = d;
      copy = c;
    }
  }
  return { distance, copy };
}

/** Abstand zum kombinierten Feld. Referenz fuer Tests und spaeter fuer die Isolinien. */
export function evaluateField(graph: FieldGraph, point: Vec2): number {
  return evaluateFieldWithCopy(graph, point).distance;
}

/**
 * Farbe an einem Punkt — die vollstaendige Kette.
 *
 * Diese Funktion ist die Wahrheit, gegen die der Shader im Golden-Frame-Vergleich
 * geprueft wird (Spec §9).
 */
export function shadeField(graph: FieldGraph, point: Vec2): Rgb {
  const { distance, copy } = evaluateFieldWithCopy(graph, point);
  const { palette, rings } = graph;

  const background = Array.isArray(palette.background[0])
    ? (palette.background as [Rgb, Rgb])[0]
    : (palette.background as Rgb);

  // Ausserhalb der Form: Hintergrund, ueberlagert vom Leuchten.
  if (distance > 0 && graph.glow <= 0) return background;

  const sample = sampleRings(distance, rings);

  // Zwei Quellen fuer die Rampe: der Bandindex (Bild 1, 4, 5) oder der Kopienindex
  // (Bild 3). Das ist das Merkmal, das ein Preset zur Farbliste unterscheidet.
  let t: number;
  if (palette.source === 'index') {
    t = copy / Math.max(1, copyCount(graph.repeat ?? NO_REPEAT) - 1);
  } else {
    const cycle = palette.repeat ?? Math.max(1, palette.stops.length);
    t = (sample.index % cycle) / Math.max(1, cycle - 1 || 1);
  }
  const banded = sampleRamp(palette.stops, Math.max(0, Math.min(1, t)));

  const withSeparator =
    palette.separator && sample.separator > 0.5 ? palette.separator : banded;

  if (distance <= 0) return withSeparator;

  // Aussen: Leuchten mit exponentiellem Abfall ueber die Bandbreite.
  const falloff = Math.exp(-distance / Math.max(1e-4, graph.glow * rings.spacing * 4));
  return [
    background[0] + (withSeparator[0] - background[0]) * falloff,
    background[1] + (withSeparator[1] - background[1]) * falloff,
    background[2] + (withSeparator[2] - background[2]) * falloff,
  ];
}

export const MIRROR_INDEX: Record<MirrorAxis, number> = { none: 0, x: 1, y: 2, both: 3 };
export const COMBINE_INDEX: Record<CombineMode, number> = {
  union: 0,
  subtract: 1,
  intersect: 2,
  smooth: 3,
};
export const SHAPE_INDEX: Record<ShapeKind, number> = { superellipse: 0, capsule: 1, ring: 2 };

/** Formen fuer die Uniform-Arrays des Shaders packen. */
export function packShapes(graph: FieldGraph): {
  a: Float32Array;
  b: Float32Array;
  kinds: Int32Array;
  count: number;
} {
  const count = Math.min(graph.shapes.length, MAX_SHAPES);
  const a = new Float32Array(MAX_SHAPES * 4);
  const b = new Float32Array(MAX_SHAPES * 4);
  const kinds = new Int32Array(MAX_SHAPES);

  for (let i = 0; i < count; i++) {
    const shape = graph.shapes[i];
    a[i * 4] = shape.center[0];
    a[i * 4 + 1] = shape.center[1];
    a[i * 4 + 2] = shape.size[0];
    a[i * 4 + 3] = shape.size[1];
    b[i * 4] = shape.exponent;
    b[i * 4 + 1] = shape.rotation;
    kinds[i] = SHAPE_INDEX[shape.kind];
  }
  return { a, b, kinds, count };
}
