/**
 * Rekursiv absteigender Parser fuer MOTIF v0.1.
 *
 * Grammatik (bewusst klein, Feature-Freeze nach M3 laut PROJECT_PROMPT.md §11):
 *
 *   document    := (use | transition)*
 *   use         := 'use' ident '(' string ')'
 *   transition  := 'transition' ident '{' assignment* '}'
 *   assignment  := ident '=' expression
 *   expression  := value ('->' value ('ease' easing)?)?
 *   value       := number unit? | string | bool | vector | call | ident
 *   vector      := '[' number (',' number)* ']'
 *   call        := ident '(' (ident ':' value (',' ident ':' value)*)? ')'
 *
 * Keine Schleifen, kein globaler Zustand: jede Transition muss auf jedem Frame
 * unabhaengig auswertbar bleiben, sonst sind Scrubbing und verteiltes Rendern hin.
 */

import { tokenize, type Token } from './lexer.ts';
import {
  MotifError,
  type Assignment,
  type CallValue,
  type Document,
  type TransitionDecl,
  type UseDecl,
  type Unit,
  type Value,
} from './types.ts';

class Parser {
  private position = 0;
  private tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private get current(): Token {
    return this.tokens[this.position];
  }

  private at(type: Token['type'], value?: string): boolean {
    return this.current.type === type && (value === undefined || this.current.value === value);
  }

  private next(): Token {
    return this.tokens[this.position++];
  }

  private expect(type: Token['type'], value?: string): Token {
    if (!this.at(type, value)) {
      const wanted = value ?? type;
      throw new MotifError(
        `${JSON.stringify(wanted)} erwartet, gefunden ${JSON.stringify(this.current.value || this.current.type)}`,
        this.current.line,
        this.current.column,
      );
    }
    return this.next();
  }

  parse(): Document {
    const statements: Document['statements'] = [];
    while (!this.at('eof')) {
      if (this.at('ident', 'use')) statements.push(this.parseUse());
      else if (this.at('ident', 'transition')) statements.push(this.parseTransition());
      else {
        throw new MotifError(
          `"use" oder "transition" erwartet, gefunden ${JSON.stringify(this.current.value)}`,
          this.current.line,
          this.current.column,
        );
      }
    }
    return { statements };
  }

  private parseUse(): UseDecl {
    const keyword = this.expect('ident', 'use');
    const namespace = this.expect('ident').value;
    this.expect('punct', '(');
    const target = this.expect('string').value;
    this.expect('punct', ')');
    return { kind: 'use', namespace, target, line: keyword.line };
  }

  private parseTransition(): TransitionDecl {
    const keyword = this.expect('ident', 'transition');
    const name = this.expect('ident').value;
    this.expect('punct', '{');

    const body: Assignment[] = [];
    while (!this.at('punct', '}')) {
      if (this.at('eof')) {
        throw new MotifError('Block ohne schliessende Klammer', keyword.line, keyword.column);
      }
      body.push(this.parseAssignment());
    }
    this.expect('punct', '}');
    return { kind: 'transition', name, body, line: keyword.line };
  }

  private parseAssignment(): Assignment {
    const name = this.expect('ident');
    this.expect('punct', '=');
    return { name: name.value, value: this.parseExpression(), line: name.line };
  }

  private parseExpression(): Value {
    const from = this.parseValue();
    if (!this.at('arrow')) return from;

    this.next();
    const to = this.parseValue();

    let ease: CallValue | { kind: 'ref'; name: string } | null = null;
    if (this.at('ident', 'ease')) {
      this.next();
      const name = this.expect('ident').value;
      ease = this.at('punct', '(') ? this.parseCall(name) : { kind: 'ref', name };
    }
    return { kind: 'animated', from, to, ease };
  }

  private parseValue(): Value {
    if (this.at('number')) {
      const token = this.next();
      const unit: Unit = this.at('unit') ? (this.next().value as Unit) : null;
      return { kind: 'number', value: Number(token.value), unit };
    }

    if (this.at('string')) return { kind: 'string', value: this.next().value };

    if (this.at('punct', '[')) {
      this.next();
      const values: number[] = [];
      while (!this.at('punct', ']')) {
        values.push(Number(this.expect('number').value));
        if (this.at('punct', ',')) this.next();
      }
      this.expect('punct', ']');
      return { kind: 'vector', values };
    }

    if (this.at('ident')) {
      const token = this.next();
      if (token.value === 'true' || token.value === 'false') {
        return { kind: 'bool', value: token.value === 'true' };
      }
      if (this.at('punct', '(')) return this.parseCall(token.value);
      // Nackter Bezeichner: als Aufruf ohne Argumente behandeln, damit `ease linear`
      // und `ease cubic(...)` denselben Knoten ergeben.
      return { kind: 'call', name: token.value, args: {} };
    }

    throw new MotifError(
      `Wert erwartet, gefunden ${JSON.stringify(this.current.value || this.current.type)}`,
      this.current.line,
      this.current.column,
    );
  }

  private parseCall(name: string): CallValue {
    this.expect('punct', '(');
    const args: Record<string, Value> = {};
    let positional = 0;

    while (!this.at('punct', ')')) {
      // Benannt (`stiffness: 180`) oder positionell (`cubic(.22, 1, .36, 1)`).
      if (this.at('ident') && this.tokens[this.position + 1]?.value === ':') {
        const key = this.next().value;
        this.next();
        args[key] = this.parseValue();
      } else {
        args[`_${positional++}`] = this.parseValue();
      }
      if (this.at('punct', ',')) this.next();
    }
    this.expect('punct', ')');
    return { kind: 'call', name, args };
  }
}

export function parse(source: string): Document {
  return new Parser(tokenize(source)).parse();
}
