/**
 * Parameter-Inspector (UC-C1).
 *
 * Grundsatz aus PROJECT_PROMPT.md §3: **jeder** Parameter ist sichtbar und live
 * veraenderbar. Es gibt hier keine kuratierte Auswahl "wichtiger" Regler und keine
 * versteckten Konstanten — was der Uebergang deklariert, steht im Panel.
 */

import { useEffect, useRef } from 'react';
import { Pane } from 'tweakpane';
import type { ParamSpec } from './transitions';
import type { ParamValue } from './gl/transition';

type Props = {
  specs: ParamSpec[];
  values: Record<string, ParamValue>;
  onChange: (name: string, value: ParamValue) => void;
};

const AXES = ['x', 'y', 'z', 'w'] as const;

/** Tweakpane bindet an Objekte, die Uniforms sind Arrays. Hin und zurueck uebersetzen. */
function toPaneValue(spec: ParamSpec, value: ParamValue): unknown {
  if (!Array.isArray(value)) return value;
  if (spec.isColor) {
    const [r, g, b, a = 1] = value;
    return { r, g, b, a };
  }
  return Object.fromEntries(value.map((v, i) => [AXES[i], v]));
}

function fromPaneValue(spec: ParamSpec, value: unknown): ParamValue {
  if (typeof value !== 'object' || value === null) return value as ParamValue;
  const record = value as Record<string, number>;
  if (spec.isColor) return [record.r, record.g, record.b, record.a ?? 1];
  return AXES.filter((axis) => axis in record).map((axis) => record[axis]);
}

export function Inspector({ specs, values, onChange }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  // Der Callback wird ueber ein Ref gefuehrt, damit das Pane nicht bei jedem
  // Renderdurchlauf neu aufgebaut wird — sonst verliert man den Fokus beim Tippen.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const pane = new Pane({ container: host });
    const state: Record<string, unknown> = {};

    for (const spec of specs) {
      state[spec.name] = toPaneValue(spec, values[spec.name] ?? spec.value);

      const options: Record<string, unknown> = { label: spec.name };
      if (spec.type === 'float' || spec.type === 'int') {
        Object.assign(options, { min: spec.min, max: spec.max, step: spec.step });
      }
      if (spec.isColor) options.color = { type: 'float' };

      pane
        .addBinding(state, spec.name, options)
        .on('change', (event) => onChangeRef.current(spec.name, fromPaneValue(spec, event.value)));
    }

    if (specs.length === 0) {
      pane.addBlade({ view: 'text', label: 'Parameter', value: 'keine', parse: (v: string) => v });
    }

    return () => pane.dispose();
    // Absichtlich nur an den Spezifikationen haengen: `values` aendert sich bei jedem
    // Reglerzug, und ein Neuaufbau des Panes mitten in der Bewegung waere fatal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [specs]);

  return <div className="inspector__pane" ref={hostRef} />;
}
