/**
 * Fertige Feldgraphen — nachgebaute Referenzbilder als Startpunkte.
 *
 * Kein Preset im Sinne einer Blackbox: jeder ist ein vollstaendiger, offener Graph,
 * dessen saemtliche Werte im Inspector stehen (Produkt-Grundsatz "Parameter-First,
 * Preset-Last"). Sie sind Ausgangspunkte zum Weiterdrehen, keine Endergebnisse.
 */

import { presetByName } from './palette.ts';
import { NO_REPEAT } from './repeat.ts';
import { NO_RASTER } from './raster.ts';
import { NO_MOTION } from './motion.ts';
import type { FieldGraph } from './graph.ts';

export type FieldPreset = { name: string; note: string; graph: FieldGraph };

export const FIELD_PRESETS: FieldPreset[] = [
  {
    name: 'Amoebe',
    note: 'Referenzbild 5: zwei verschmolzene Lappen, feine Trennlinien, Raute im Kern',
    graph: {
      shapes: [
        { kind: 'superellipse', center: [0, 0.45], size: [0.42, 0.42], exponent: 2, rotation: 0 },
        { kind: 'superellipse', center: [0, -0.45], size: [0.42, 0.42], exponent: 2, rotation: 0 },
        { kind: 'superellipse', center: [0, 0], size: [0.16, 0.16], exponent: 1, rotation: 0 },
      ],
      combineMode: 'smooth',
      smoothness: 0.35,
      mirrorAxis: 'none',
      rings: { spacing: 0.045, curve: 0.85, hardness: 1, line: 0.16, stagger: 0 },
      palette: presetByName('Amoebe'),
      glow: 0,
      repeat: NO_REPEAT,
      raster: NO_RASTER,
      motion: { ...NO_MOTION, drift: 1 },
    },
  },
  {
    name: 'Club',
    note: 'Referenzbild 1: Squircle-Rahmen, Baender von aussen nach innen, starkes Leuchten',
    graph: {
      shapes: [
        { kind: 'superellipse', center: [0, 0], size: [0.62, 0.4], exponent: 4.5, rotation: 0 },
      ],
      combineMode: 'union',
      smoothness: 0,
      mirrorAxis: 'none',
      rings: { spacing: 0.07, curve: 1, hardness: 1, line: 0, stagger: 0 },
      palette: presetByName('Club'),
      glow: 0.5,
      repeat: NO_REPEAT,
      raster: NO_RASTER,
      motion: { ...NO_MOTION, drift: 1 },
    },
  },
  {
    name: 'Neon',
    note: 'Referenzbild 4: Kapselkreuz, weicher Abfall, Kontrastpol im Kern',
    graph: {
      shapes: [
        { kind: 'capsule', center: [0, 0], size: [1.6, 0.03], exponent: 2, rotation: 0.35 },
        { kind: 'capsule', center: [0, 0], size: [1.6, 0.03], exponent: 2, rotation: -1.2 },
      ],
      combineMode: 'union',
      smoothness: 0,
      mirrorAxis: 'none',
      rings: { spacing: 0.12, curve: 1, hardness: 0, line: 0, stagger: 0 },
      palette: presetByName('Neon'),
      glow: 0.85,
      repeat: NO_REPEAT,
      raster: NO_RASTER,
      motion: { ...NO_MOTION, drift: 1 },
    },
  },
  {
    name: 'Rohrpost',
    note: 'Referenzbild 2 als Naeherung: verschmolzene Kapseln statt gezeichneter Pfade',
    graph: {
      shapes: [
        { kind: 'capsule', center: [-0.3, 0.3], size: [0.9, 0.05], exponent: 2, rotation: 0 },
        { kind: 'capsule', center: [0.15, 0], size: [0.7, 0.05], exponent: 2, rotation: 1.5708 },
        { kind: 'capsule', center: [0.4, -0.35], size: [0.6, 0.05], exponent: 2, rotation: 0 },
        { kind: 'ring', center: [-0.75, 0.3], size: [0.09, 0.05], exponent: 2, rotation: 0 },
      ],
      combineMode: 'union',
      smoothness: 0,
      mirrorAxis: 'none',
      rings: { spacing: 0.035, curve: 1, hardness: 1, line: 0, stagger: 0 },
      palette: presetByName('Rohrpost'),
      glow: 0,
      repeat: NO_REPEAT,
      raster: NO_RASTER,
      motion: { ...NO_MOTION, drift: 1 },
    },
  },
  {
    name: 'Stapel',
    note: 'Referenzbild 3: eine Ellipse vielfach versetzt, Farbe wandert ueber den Stapel',
    graph: {
      shapes: [
        { kind: 'superellipse', center: [0, 0.55], size: [0.34, 0.12], exponent: 2, rotation: 0 },
      ],
      combineMode: 'union',
      smoothness: 0,
      mirrorAxis: 'none',
      rings: { spacing: 0.5, curve: 1, hardness: 1, line: 0, stagger: 0 },
      palette: presetByName('Stapel'),
      glow: 0,
      repeat: { count: 16, offset: [0, -0.075], scale: 0.995, rotation: 0 },
      raster: { ...NO_RASTER, grain: 0.08 },
      motion: { ...NO_MOTION, pulse: 0.06 },
    },
  },
  {
    name: 'Halbton',
    note: 'Referenzbild 7: Punktraster traegt die Form, Punktgroesse folgt der Helligkeit',
    graph: {
      shapes: [
        { kind: 'capsule', center: [0, 0.1], size: [2.2, 0.28], exponent: 2, rotation: -0.35 },
      ],
      combineMode: 'union',
      smoothness: 0,
      mirrorAxis: 'none',
      rings: { spacing: 0.22, curve: 1.15, hardness: 0, line: 0, stagger: 0 },
      palette: presetByName('Halbton'),
      glow: 1.1,
      repeat: NO_REPEAT,
      raster: { mode: 'dots', cell: 9, angle: 0.4, grain: 0 },
      motion: { ...NO_MOTION, drift: 2 },
    },
  },
  {
    name: 'Bitmap',
    note: 'Referenzbild 8: Blockdithering ueber einem Verlauf, sparsam gesetzt',
    graph: {
      shapes: [
        { kind: 'superellipse', center: [-0.2, -0.3], size: [0.7, 0.22], exponent: 1.4, rotation: 0.2 },
      ],
      combineMode: 'union',
      smoothness: 0,
      mirrorAxis: 'none',
      rings: { spacing: 0.3, curve: 1, hardness: 0, line: 0, stagger: 0 },
      palette: presetByName('Bitmap'),
      glow: 0.7,
      repeat: NO_REPEAT,
      raster: { mode: 'blocks', cell: 14, angle: 0, grain: 0 },
      motion: { ...NO_MOTION, drift: 1, wobble: 0.05 },
    },
  },
];

export function fieldPresetByName(name: string): FieldPreset {
  const found = FIELD_PRESETS.find((p) => p.name === name);
  if (!found) throw new Error(`Unbekanntes Feld-Preset: ${name}`);
  return found;
}
