/**
 * MIR — die stabile Schnittstelle zwischen Sprache und Renderern.
 *
 * Laut PROJECT_PROMPT.md §6 darf sich die Textsprache noch aendern, die MIR wird
 * gepinnt. Alles, was rendert (Web, AE, headless), liest ausschliesslich MIR und
 * nie den AST.
 */

import type { Document, TransitionDecl, Value } from './types.ts';
import { UNIT_KIND } from './types.ts';

export const MIR_VERSION = '0.1.0';

export type MirParam =
  | { type: 'const'; value: number | boolean | string | number[] }
  | { type: 'anim'; from: number | number[]; to: number | number[]; ease: string };

export type Mir = {
  version: string;
  /** Woher der Node stammt, z. B. "gl:crosswarp". */
  source: string;
  name: string;
  /** Dauer in Millisekunden, aufgeloest ueber die Projekt-Framerate. */
  durationMs: number | null;
  ease: string;
  params: Record<string, MirParam>;
};

export class MirError extends Error {}

/** Zeitwerte auf Millisekunden bringen. Frames brauchen dafuer die Framerate. */
export function toMilliseconds(value: number, unit: string | null, fps: number): number {
  switch (unit) {
    case 'ms':
      return value;
    case 's':
      return value * 1000;
    case 'f':
      return (value / fps) * 1000;
    default:
      throw new MirError(
        `"${value}${unit ?? ''}" ist keine Zeit. Erlaubt sind f, ms, s — Einheiten sind Typen.`,
      );
  }
}

function plain(value: Value): number | boolean | string | number[] {
  switch (value.kind) {
    case 'number':
      return value.value;
    case 'bool':
    case 'string':
      return value.value;
    case 'vector':
      return value.values;
    case 'call':
      return value.name;
    case 'animated':
      throw new MirError('Verschachtelte Animationen gibt es in MOTIF v0.1 nicht.');
  }
}

function easeName(value: Value): string {
  if (value.kind === 'call') {
    const args = Object.values(value.args).map((a) => (a.kind === 'number' ? a.value : 0));
    return args.length ? `${value.name}(${args.join(',')})` : value.name;
  }
  if (value.kind === 'string') return value.value;
  return 'linear';
}

/**
 * Einen Typfehler frueh melden: `duration = 2.4px` ist kein Tippfehler im
 * Rendering, sondern ein Denkfehler im Dokument.
 */
function assertTime(name: string, value: Value): asserts value is Extract<Value, { kind: 'number' }> {
  if (value.kind !== 'number' || UNIT_KIND[value.unit ?? ''] !== 'time') {
    throw new MirError(`"${name}" braucht eine Zeit (f, ms, s).`);
  }
}

export function toMir(document: Document, fps = 25): Mir {
  const transition = document.statements.find(
    (s): s is TransitionDecl => s.kind === 'transition',
  );
  if (!transition) throw new MirError('Kein transition-Block im Dokument.');

  const use = document.statements.find((s) => s.kind === 'use');
  let source = use ? `${use.namespace}:${use.target}` : '';
  let durationMs: number | null = null;
  let ease = 'linear';
  const params: Record<string, MirParam> = {};

  for (const assignment of transition.body) {
    const { name, value } = assignment;

    if (name === 'duration') {
      assertTime(name, value);
      durationMs = toMilliseconds(value.value, value.unit, fps);
      continue;
    }
    if (name === 'ease') {
      ease = easeName(value);
      continue;
    }
    if (name === 'node') {
      source = value.kind === 'string' ? value.value : String(plain(value));
      continue;
    }

    params[name] =
      value.kind === 'animated'
        ? {
            type: 'anim',
            from: plain(value.from) as number | number[],
            to: plain(value.to) as number | number[],
            ease: value.ease
              ? easeName(value.ease.kind === 'ref' ? { kind: 'string', value: value.ease.name } : value.ease)
              : ease,
          }
        : { type: 'const', value: plain(value) };
  }

  if (!source) throw new MirError('Kein Node angegeben — `use gl("name")` fehlt.');

  return { version: MIR_VERSION, source, name: transition.name, durationMs, ease, params };
}
