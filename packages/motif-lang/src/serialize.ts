/**
 * AST -> Text.
 *
 * Muss stabil sein: dieselbe Struktur ergibt immer dieselben Zeichen. Sonst
 * erzeugt jedes Speichern Diff-Rauschen, und "Text ist das Format" (Prinzip 6)
 * waere nur eine Behauptung.
 */

import type { Document, Value } from './types.ts';

/** Zahlen kurz halten, aber ohne Genauigkeitsverlust im relevanten Bereich. */
function formatNumber(value: number): string {
  if (Number.isInteger(value)) return String(value);
  const rounded = Number(value.toFixed(6));
  return String(rounded);
}

export function formatValue(value: Value): string {
  switch (value.kind) {
    case 'number':
      return formatNumber(value.value) + (value.unit ?? '');
    case 'string':
      return JSON.stringify(value.value);
    case 'bool':
      return String(value.value);
    case 'vector':
      return `[${value.values.map(formatNumber).join(', ')}]`;
    case 'call': {
      const args = Object.entries(value.args);
      if (args.length === 0) return value.name;
      const inner = args
        .map(([key, arg]) =>
          key.startsWith('_') ? formatValue(arg) : `${key}: ${formatValue(arg)}`,
        )
        .join(', ');
      return `${value.name}(${inner})`;
    }
    case 'animated': {
      const base = `${formatValue(value.from)} -> ${formatValue(value.to)}`;
      if (!value.ease) return base;
      const ease = value.ease.kind === 'ref' ? value.ease.name : formatValue(value.ease);
      return `${base} ease ${ease}`;
    }
  }
}

export function serialize(document: Document, header?: string): string {
  const lines: string[] = [];
  if (header) lines.push(...header.split('\n').map((line) => `// ${line}`), '');

  for (const statement of document.statements) {
    if (statement.kind === 'use') {
      lines.push(`use ${statement.namespace}(${JSON.stringify(statement.target)})`);
      continue;
    }

    lines.push('', `transition ${statement.name} {`);
    // Spalten ausrichten: erleichtert das Lesen und haelt Diffs auf die Zeile
    // beschraenkt, die sich wirklich geaendert hat.
    const width = Math.max(0, ...statement.body.map((a) => a.name.length));
    for (const assignment of statement.body) {
      lines.push(`  ${assignment.name.padEnd(width)} = ${formatValue(assignment.value)}`);
    }
    lines.push('}');
  }

  return lines.join('\n').trim() + '\n';
}
