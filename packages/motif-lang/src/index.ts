/** MOTIF v0.1 — oeffentliche Schnittstelle. */

export { tokenize, type Token } from './lexer.ts';
export { parse } from './parser.ts';
export { serialize, formatValue } from './serialize.ts';
export { toMir, toMilliseconds, MIR_VERSION, MirError, type Mir, type MirParam } from './mir.ts';
export * from './types.ts';

import { parse } from './parser.ts';
import { serialize } from './serialize.ts';
import type { Document, Value } from './types.ts';

export type BuildInput = {
  /** Name des Uebergangs, wird zum Blocknamen. */
  name: string;
  /** Herkunft des Nodes, aktuell immer die gl-transitions-Sammlung. */
  glTransition: string;
  durationFrames: number;
  ease: string;
  /** Parameterwerte, wie sie im Inspector stehen. */
  params: Record<string, number | boolean | number[]>;
};

function toValue(raw: number | boolean | number[]): Value {
  if (typeof raw === 'boolean') return { kind: 'bool', value: raw };
  if (typeof raw === 'number') return { kind: 'number', value: raw, unit: null };
  return { kind: 'vector', values: raw };
}

/** Aus dem UI-Zustand ein Dokument bauen — der Weg Oberflaeche -> Text. */
export function buildDocument(input: BuildInput): Document {
  return {
    statements: [
      { kind: 'use', namespace: 'gl', target: input.glTransition, line: 1 },
      {
        kind: 'transition',
        name: input.name,
        line: 2,
        body: [
          { name: 'duration', value: { kind: 'number', value: input.durationFrames, unit: 'f' }, line: 3 },
          { name: 'ease', value: { kind: 'call', name: input.ease, args: {} }, line: 4 },
          ...Object.entries(input.params).map(([key, raw], index) => ({
            name: key,
            value: toValue(raw),
            line: 5 + index,
          })),
        ],
      },
    ],
  };
}

/**
 * Stabiler Kurz-Hash (FNV-1a) ueber den serialisierten Text.
 *
 * Dient dazu, einen approvten Snapshot wiederzuerkennen, nicht der Sicherheit --
 * deshalb bewusst synchron und ohne Krypto-Abhaengigkeit.
 */
export function hashDocument(document: Document): string {
  const text = serialize(document);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Text -> Dokument -> Text muss denselben Text ergeben. Grundlage der Diffbarkeit. */
export function roundtrip(source: string): string {
  return serialize(parse(source));
}
