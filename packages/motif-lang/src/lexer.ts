/** Tokenizer fuer MOTIF v0.1. */

import { MotifError } from './types.ts';

export type TokenType =
  | 'ident'
  | 'number'
  | 'string'
  | 'unit'
  | 'punct'
  | 'arrow'
  | 'eof';

export type Token = {
  type: TokenType;
  value: string;
  line: number;
  column: number;
};

const PUNCT = new Set(['{', '}', '(', ')', '[', ']', ',', ':', '=']);
// Laengere Einheiten zuerst, sonst frisst `s` das `ms`.
const UNITS = ['ms', 'deg', 'px', 'f', 's', '%'];

const isDigit = (c: string) => c >= '0' && c <= '9';
const isIdentStart = (c: string) => /[A-Za-z_]/.test(c);
const isIdentPart = (c: string) => /[A-Za-z0-9_.]/.test(c);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  let line = 1;
  let column = 1;

  const push = (type: TokenType, value: string, col = column) =>
    tokens.push({ type, value, line, column: col });

  const advance = (count = 1) => {
    for (let i = 0; i < count; i++) {
      if (source[index] === '\n') {
        line++;
        column = 1;
      } else {
        column++;
      }
      index++;
    }
  };

  while (index < source.length) {
    const char = source[index];

    if (char === ' ' || char === '\t' || char === '\r' || char === '\n') {
      advance();
      continue;
    }

    // Kommentare bis Zeilenende. Sie gehen verloren beim Neuschreiben der Datei --
    // das UI generiert die Datei, der Mensch liest und diffed sie.
    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') advance();
      continue;
    }

    if (char === '-' && source[index + 1] === '>') {
      push('arrow', '->');
      advance(2);
      continue;
    }

    if (isDigit(char) || (char === '-' && isDigit(source[index + 1] ?? '')) || (char === '.' && isDigit(source[index + 1] ?? ''))) {
      const start = index;
      const startColumn = column;
      if (char === '-') advance();
      while (index < source.length && (isDigit(source[index]) || source[index] === '.')) advance();
      push('number', source.slice(start, index), startColumn);

      const rest = source.slice(index);
      const unit = UNITS.find((u) => rest.startsWith(u));
      // `1.5s` ist eine Zahl mit Einheit, `1.5 second` nicht -- nach der Einheit
      // darf kein weiteres Wortzeichen stehen.
      if (unit && !isIdentPart(rest[unit.length] ?? '')) {
        push('unit', unit);
        advance(unit.length);
      }
      continue;
    }

    if (char === '"' || char === "'") {
      const quote = char;
      const startColumn = column;
      advance();
      const start = index;
      while (index < source.length && source[index] !== quote) {
        if (source[index] === '\n') throw new MotifError('Zeichenkette ohne Ende', line, startColumn);
        advance();
      }
      if (index >= source.length) throw new MotifError('Zeichenkette ohne Ende', line, startColumn);
      push('string', source.slice(start, index), startColumn);
      advance();
      continue;
    }

    if (isIdentStart(char)) {
      const start = index;
      const startColumn = column;
      while (index < source.length && isIdentPart(source[index])) advance();
      push('ident', source.slice(start, index), startColumn);
      continue;
    }

    if (PUNCT.has(char)) {
      push('punct', char);
      advance();
      continue;
    }

    throw new MotifError(`Unerwartetes Zeichen ${JSON.stringify(char)}`, line, column);
  }

  tokens.push({ type: 'eof', value: '', line, column });
  return tokens;
}
