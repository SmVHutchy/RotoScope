/**
 * Farbrampen und Presets.
 *
 * Interpoliert wird in CIELAB ueber grade-core. In sRGB gemischt ergibt Rot nach Gelb
 * ein schlammiges Braun in der Mitte -- genau der Unterschied zwischen "sieht aus wie
 * die Vorlage" und "sieht aus wie ein Generator" (Spec §5).
 *
 * Ein Preset ist keine Farbliste. Zwei Strukturmerkmale tragen den Charakter der
 * Referenzen und stehen deshalb im Format:
 *
 * - **Wo sitzt der Kontrastpol** -- im Kern (Club, Neon) oder ganz aussen (Stapel)?
 * - **Was liest die Rampe** -- den Abstand oder den Kopienindex des Repeaters?
 */

import { labToRgb, rgbToLab, type Rgb } from '@rotoscope/grade-core';

export type RampSource = 'distance' | 'index';

export type PalettePreset = {
  name: string;
  /** Hintergrund; zwei Farben ergeben einen senkrechten Verlauf (Bild 2 und 8). */
  background: Rgb | [Rgb, Rgb];
  /** Geordnet von aussen nach innen. */
  stops: Rgb[];
  source: RampSource;
  /** Rampe alle N Baender wiederholen; null heisst einmal ueber die ganze Strecke. */
  repeat: number | null;
  /** Duenne Trennlinie zwischen den Baendern (Bild 5). */
  separator: Rgb | null;
};

const hex = (value: string): Rgb => [
  parseInt(value.slice(1, 3), 16) / 255,
  parseInt(value.slice(3, 5), 16) / 255,
  parseInt(value.slice(5, 7), 16) / 255,
];

/**
 * Aus den Referenzbildern gelesen.
 *
 * Achtung: die Werte sind **geschaetzt, nicht an den Originaldateien gemessen**
 * (Spec §13). Sie treffen den Charakter, nicht die exakte Farbe.
 */
export const PRESETS: PalettePreset[] = [
  {
    name: 'Club',
    background: hex('#0a0406'),
    stops: [hex('#ffd400'), hex('#f26a1b'), hex('#c8102e'), hex('#e91e8c'), hex('#4b2e83')],
    source: 'distance',
    repeat: null,
    separator: null,
  },
  {
    name: 'Rohrpost',
    background: [hex('#1a0d06'), hex('#e8731a')],
    stops: [hex('#ffd21f'), hex('#f58220'), hex('#e8481f')],
    source: 'distance',
    repeat: 3,
    separator: null,
  },
  {
    name: 'Stapel',
    background: hex('#101010'),
    stops: [hex('#ff4a1c'), hex('#f5a623'), hex('#2e7d32')],
    // Liest den Kopienindex -- erst mit dem Repeater in Stufe 2 wirklich nutzbar.
    source: 'index',
    repeat: null,
    separator: null,
  },
  {
    name: 'Neon',
    background: hex('#141414'),
    stops: [hex('#ff2d2d'), hex('#ffd400'), hex('#22c1c3')],
    source: 'distance',
    repeat: null,
    separator: null,
  },
  {
    name: 'Amoebe',
    background: hex('#ff2d0d'),
    stops: [hex('#0d0d0d'), hex('#c8e86a')],
    source: 'distance',
    repeat: null,
    separator: hex('#ff2d0d'),
  },
  {
    name: 'Riso',
    background: hex('#e8412a'),
    stops: [hex('#111111')],
    source: 'distance',
    repeat: null,
    separator: null,
  },
];

export function presetByName(name: string): PalettePreset {
  const found = PRESETS.find((p) => p.name === name);
  if (!found) throw new Error(`Unbekanntes Preset: ${name}`);
  return found;
}

/** Rampe an Position 0..1 abtasten, interpoliert in Lab. */
export function sampleRamp(stops: Rgb[], t: number): Rgb {
  if (!stops.length) throw new Error('Rampe ohne Farben.');
  if (stops.length === 1) return stops[0];

  const clamped = Math.max(0, Math.min(1, t));
  const scaled = clamped * (stops.length - 1);
  const lower = Math.min(stops.length - 2, Math.floor(scaled));
  const f = scaled - lower;

  const a = rgbToLab(stops[lower]);
  const b = rgbToLab(stops[lower + 1]);
  return labToRgb([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/**
 * Rampe als Textur backen.
 *
 * Der Shader schlaegt nach, statt in GLSL in Lab zu rechnen: Lab im Fragmentshader
 * waere pro Pixel teuer und muesste die Mathematik ein zweites Mal fuehren -- also
 * genau die Doppelung, die dieses Paket vermeiden soll.
 */
export function bakeRamp(stops: Rgb[], size = 256): Uint8Array {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const [r, g, b] = sampleRamp(stops, i / (size - 1));
    data[i * 4] = Math.round(r * 255);
    data[i * 4 + 1] = Math.round(g * 255);
    data[i * 4 + 2] = Math.round(b * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}
