/**
 * Feldgraph als flache Parameterliste — damit der bestehende Inspector ihn bedient.
 *
 * Der Inspector aus der Transition-Werkbank kann jeden Wert anzeigen, den man ihm
 * als ParamSpec beschreibt. Statt ein zweites Bedienfeld zu bauen, wird der Graph
 * hierher uebersetzt und zurueck. Ein Werkzeug, zwei Inhalte.
 */

import type { FieldGraph, ShapeNode } from '@rotoscope/field-core';
import type { ParamSpec } from '../transitions';
import type { ParamValue } from '../gl/transition';

/** Ein Pfad wie "ring.spacing" oder "shape1.size". */
export type FieldPath = string;

export function fieldSpecs(graph: FieldGraph): ParamSpec[] {
  const specs: ParamSpec[] = [
    { name: 'ring.spacing', type: 'float', value: graph.rings.spacing, min: 0.005, max: 0.4, step: 0.001, isColor: false },
    { name: 'ring.curve', type: 'float', value: graph.rings.curve, min: 0.3, max: 3, step: 0.01, isColor: false },
    { name: 'ring.hardness', type: 'float', value: graph.rings.hardness, min: 0, max: 1, step: 0.01, isColor: false },
    { name: 'ring.line', type: 'float', value: graph.rings.line, min: 0, max: 0.9, step: 0.01, isColor: false },
    { name: 'ring.stagger', type: 'float', value: graph.rings.stagger, min: -1, max: 1, step: 0.01, isColor: false },
    { name: 'glow', type: 'float', value: graph.glow, min: 0, max: 2, step: 0.01, isColor: false },
    { name: 'smoothness', type: 'float', value: graph.smoothness, min: 0, max: 1, step: 0.01, isColor: false },
  ];

  graph.shapes.forEach((shape, index) => {
    specs.push(
      { name: `shape${index}.center`, type: 'vec2', value: [...shape.center], isColor: false },
      { name: `shape${index}.size`, type: 'vec2', value: [...shape.size], isColor: false },
      { name: `shape${index}.exponent`, type: 'float', value: shape.exponent, min: 0.3, max: 12, step: 0.05, isColor: false },
      { name: `shape${index}.rotation`, type: 'float', value: shape.rotation, min: -Math.PI, max: Math.PI, step: 0.01, isColor: false },
    );
  });

  return specs;
}

/** Einen geaenderten Wert zurueck in den Graphen schreiben. Erzeugt eine neue Kopie. */
export function applyFieldParam(graph: FieldGraph, path: FieldPath, value: ParamValue): FieldGraph {
  const next: FieldGraph = { ...graph, rings: { ...graph.rings }, shapes: graph.shapes.map((s) => ({ ...s })) };
  const [head, tail] = path.split('.');

  if (head === 'ring') {
    (next.rings as unknown as Record<string, number>)[tail] = Number(value);
    return next;
  }
  if (head === 'glow' || head === 'smoothness') {
    next[head] = Number(value);
    return next;
  }

  const index = Number(head.replace('shape', ''));
  const shape = next.shapes[index];
  if (!shape) return next;

  if (tail === 'center' || tail === 'size') {
    const pair = value as number[];
    shape[tail] = [pair[0], pair[1]];
  } else {
    (shape as unknown as Record<string, number>)[tail] = Number(value);
  }
  return next;
}

/** Neue Form am Ende anhaengen — Obergrenze prueft der Aufrufer. */
export function addShape(graph: FieldGraph, shape: ShapeNode): FieldGraph {
  return { ...graph, shapes: [...graph.shapes, shape] };
}
