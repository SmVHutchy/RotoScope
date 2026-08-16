/** MOTIF v0.1 — Datentypen. Siehe PROJECT_PROMPT.md §6. */

/**
 * Einheiten sind Typen, nicht Dekoration.
 *
 * `18f + 750ms` ist gueltig (beides Zeit, Frames ueber die Projekt-Framerate),
 * `2.4px + 45deg` ist ein Typfehler. Das faengt die Haelfte aller Motion-Bugs
 * zur Compile-Zeit statt im Rendering.
 */
export type Unit = 'f' | 'ms' | 's' | 'px' | '%' | 'deg' | null;

export const UNIT_KIND: Record<string, 'time' | 'length' | 'ratio' | 'angle' | 'scalar'> = {
  f: 'time',
  ms: 'time',
  s: 'time',
  px: 'length',
  '%': 'ratio',
  deg: 'angle',
};

export type NumberValue = { kind: 'number'; value: number; unit: Unit };
export type StringValue = { kind: 'string'; value: string };
export type BoolValue = { kind: 'bool'; value: boolean };
export type VectorValue = { kind: 'vector'; values: number[] };
export type CallValue = { kind: 'call'; name: string; args: Record<string, Value> };

/** `a -> b`: ein animierter Wert ist ein eigener Typ, keine Zuweisung. */
export type AnimatedValue = {
  kind: 'animated';
  from: Value;
  to: Value;
  ease: CallValue | { kind: 'ref'; name: string } | null;
};

export type Value =
  | NumberValue
  | StringValue
  | BoolValue
  | VectorValue
  | CallValue
  | AnimatedValue;

export type Assignment = { name: string; value: Value; line: number };

export type TransitionDecl = {
  kind: 'transition';
  name: string;
  body: Assignment[];
  line: number;
};

export type UseDecl = {
  kind: 'use';
  /** Namensraum, aktuell nur `gl` (die gl-transitions-Sammlung). */
  namespace: string;
  target: string;
  line: number;
};

export type Document = {
  statements: (UseDecl | TransitionDecl)[];
};

export class MotifError extends Error {
  // Felder explizit statt als Parameter-Properties: Node fuehrt die Quellen im
  // Strip-Only-Modus direkt aus, und der kennt diese TypeScript-Kurzform nicht.
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(`${message} (Zeile ${line}, Spalte ${column})`);
    this.name = 'MotifError';
    this.line = line;
    this.column = column;
  }
}
