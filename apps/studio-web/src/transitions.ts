/**
 * Der Katalog: gl-transitions als MOTIF-Nodes gelesen.
 *
 * Kern von UC-B9. Die Sammlung deklariert je Uebergang Name, Uniforms mit Typen und
 * Defaults — das ist bereits eine Node-Signatur. MOTIF muss sie nicht erfinden,
 * sondern nur lesen und darueber Zeit und Komposition legen.
 */

import catalog, { type GlTransition } from 'gl-transitions';
import type { ParamValue } from './gl/transition';

export type { GlTransition };

/** Ein Parameter, wie ihn der Inspector braucht: Typ, Default, sinnvoller Bereich. */
export type ParamSpec = {
  name: string;
  type: string;
  value: ParamValue;
  /** Nur bei skalaren Typen belegt. */
  min?: number;
  max?: number;
  step?: number;
  isColor: boolean;
};

export const transitions: GlTransition[] = [...catalog].sort((a, b) =>
  a.name.localeCompare(b.name),
);

export function byName(name: string): GlTransition {
  const found = transitions.find((t) => t.name === name);
  if (!found) throw new Error(`Übergang "${name}" gibt es nicht.`);
  return found;
}

/**
 * Bereich fuer einen Zahlenregler raten.
 *
 * gl-transitions deklariert Typ und Default, aber keine Grenzen. Ohne Bereich waere
 * jeder Regler entweder unbrauchbar fein oder unbrauchbar grob. Die Heuristik ist
 * bewusst simpel und sichtbar: sie leitet aus dem Default ab. Wo sie danebenliegt,
 * kann der Wert im Inspector direkt getippt werden — und der spaetere .motif-Eintrag
 * ueberschreibt sie ohnehin.
 */
function guessRange(value: number): { min: number; max: number; step: number } {
  if (value === 0) return { min: -1, max: 1, step: 0.01 };
  const magnitude = Math.abs(value);
  if (Number.isInteger(value) && magnitude > 1) {
    return { min: 0, max: Math.max(10, value * 4), step: 1 };
  }
  if (magnitude <= 1) return { min: 0, max: 1, step: 0.001 };
  return { min: 0, max: magnitude * 4, step: magnitude / 100 };
}

const COLOR_HINT = /colou?r/i;

/** Parameter-Spezifikation eines Uebergangs — die Grundlage des Inspectors (UC-C1). */
export function specsOf(transition: GlTransition): ParamSpec[] {
  return Object.entries(transition.paramsTypes).map(([name, type]) => {
    const value = transition.defaultParams[name] ?? defaultFor(type);
    const isColor = type === 'vec4' && COLOR_HINT.test(name);
    const spec: ParamSpec = { name, type, value, isColor };

    if (type === 'float' || type === 'int') Object.assign(spec, guessRange(Number(value)));
    return spec;
  });
}

function defaultFor(type: string): ParamValue {
  switch (type) {
    case 'bool':
      return false;
    case 'int':
    case 'float':
      return 0;
    case 'vec2':
    case 'ivec2':
      return [0, 0];
    case 'vec3':
      return [0, 0, 0];
    case 'vec4':
      return [0, 0, 0, 1];
    default:
      return 0;
  }
}

/** Startwerte fuer einen Uebergang, als flaches Objekt fuer den Renderer. */
export function defaultsOf(transition: GlTransition): Record<string, ParamValue> {
  return Object.fromEntries(specsOf(transition).map((s) => [s.name, s.value]));
}
