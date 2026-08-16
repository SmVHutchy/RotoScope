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

/**
 * Reglerbereiche duerfen den Graphen nicht umschreiben.
 *
 * Tweakpane kappt Werte ausserhalb von min/max und meldet den gekappten Wert
 * zurueck — ein Preset mit einem Wert knapp ausserhalb wird damit beim Laden
 * stillschweigend veraendert. Die Grenzen sind deshalb so weit gefasst, dass sie
 * die mitgelieferten Presets sicher einschliessen.
 */
function span(value: number, min: number, max: number): [number, number] {
  return [Math.min(min, value), Math.max(max, value)];
}

export function fieldSpecs(graph: FieldGraph): ParamSpec[] {
  const [spacingMin, spacingMax] = span(graph.rings.spacing, 0.005, 0.4);
  const [glowMin, glowMax] = span(graph.glow, 0, 2);
  const specs: ParamSpec[] = [
    { name: 'ring.spacing', type: 'float', value: graph.rings.spacing, min: spacingMin, max: spacingMax, step: 0.001, isColor: false },
    { name: 'ring.curve', type: 'float', value: graph.rings.curve, min: 0.3, max: 3, step: 0.01, isColor: false },
    { name: 'ring.hardness', type: 'float', value: graph.rings.hardness, min: 0, max: 1, step: 0.01, isColor: false },
    { name: 'ring.line', type: 'float', value: graph.rings.line, min: 0, max: 0.9, step: 0.01, isColor: false },
    { name: 'ring.stagger', type: 'float', value: graph.rings.stagger, min: -1, max: 1, step: 0.01, isColor: false },
    { name: 'glow', type: 'float', value: graph.glow, min: glowMin, max: glowMax, step: 0.01, isColor: false },
    { name: 'smoothness', type: 'float', value: graph.smoothness, min: 0, max: 1, step: 0.01, isColor: false },
    { name: 'repeat.count', type: 'float', value: graph.repeat.count, min: 1, max: 24, step: 1, isColor: false },
    { name: 'repeat.offset', type: 'vec2', value: [...graph.repeat.offset], isColor: false },
    { name: 'repeat.scale', type: 'float', value: graph.repeat.scale, min: 0.8, max: 1.2, step: 0.001, isColor: false },
    { name: 'repeat.rotation', type: 'float', value: graph.repeat.rotation, min: -0.5, max: 0.5, step: 0.005, isColor: false },
    { name: 'raster.cell', type: 'float', value: graph.raster.cell, min: 2, max: 40, step: 0.5, isColor: false },
    { name: 'raster.angle', type: 'float', value: graph.raster.angle, min: -1.6, max: 1.6, step: 0.01, isColor: false },
    { name: 'raster.grain', type: 'float', value: graph.raster.grain, min: 0, max: 0.5, step: 0.005, isColor: false },
    // drift und spin ganzzahlig: nur dann schliesst die Schleife nahtlos.
    { name: 'motion.drift', type: 'float', value: graph.motion.drift, min: -4, max: 4, step: 1, isColor: false },
    { name: 'motion.spin', type: 'float', value: graph.motion.spin, min: -2, max: 2, step: 1, isColor: false },
    { name: 'motion.pulse', type: 'float', value: graph.motion.pulse, min: 0, max: 0.4, step: 0.005, isColor: false },
    { name: 'motion.wobble', type: 'float', value: graph.motion.wobble, min: 0, max: 0.3, step: 0.005, isColor: false },
    { name: 'motion.durationFrames', type: 'float', value: graph.motion.durationFrames, min: 12, max: 300, step: 1, isColor: false },
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
  const next: FieldGraph = {
    ...graph,
    rings: { ...graph.rings },
    repeat: { ...graph.repeat, offset: [...graph.repeat.offset] },
    raster: { ...graph.raster },
    motion: { ...graph.motion },
    shapes: graph.shapes.map((s) => ({ ...s })),
  };
  const [head, tail] = path.split('.');

  if (head === 'motion') {
    (next.motion as unknown as Record<string, number>)[tail] = Number(value);
    return next;
  }

  if (head === 'raster') {
    (next.raster as unknown as Record<string, number>)[tail] = Number(value);
    return next;
  }

  if (head === 'repeat') {
    if (tail === 'offset') {
      const pair = value as number[];
      next.repeat.offset = [pair[0], pair[1]];
    } else {
      (next.repeat as unknown as Record<string, number>)[tail] = Number(value);
    }
    return next;
  }

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
