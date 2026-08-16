/**
 * Parameter-Inspector (UC-C1).
 *
 * Grundsatz aus PROJECT_PROMPT.md §3: **jeder** Parameter ist sichtbar und live
 * veraenderbar. Es gibt hier keine kuratierte Auswahl "wichtiger" Regler und keine
 * versteckten Konstanten — was der Uebergang deklariert, steht im Panel.
 */

import { useEffect, useMemo, useRef } from 'react';
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
  const paneRef = useRef<Pane | null>(null);
  const stateRef = useRef<Record<string, unknown>>({});

  // Callback und Specs laufen ueber Refs, damit sie den Pane nicht neu aufbauen.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const specsRef = useRef(specs);
  specsRef.current = specs;

  /**
   * Der Pane wird nur neu gebaut, wenn sich die **Struktur** aendert — Namen und
   * Typen der Parameter.
   *
   * Vorher hing der Aufbau an der Identitaet der Spec-Liste. In der
   * Transition-Werkbank fiel das nicht auf, weil sie sich nur beim Uebergangswechsel
   * aendert. Im Feldgenerator entsteht bei jedem Reglerzug eine neue Liste: der Pane
   * wurde mitten in der Bewegung abgerissen und neu aufgebaut, und die Anzeige kippte
   * auf NaN. Dieselbe Regel wie beim Shader — neu bauen nur bei Strukturaenderung.
   */
  const signature = useMemo(
    () => specs.map((spec) => `${spec.name}:${spec.type}`).join('|'),
    [specs],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const pane = new Pane({ container: host });
    const state: Record<string, unknown> = {};
    paneRef.current = pane;
    stateRef.current = state;

    const current = specsRef.current;
    for (const spec of current) {
      state[spec.name] = toPaneValue(spec, spec.value);

      const options: Record<string, unknown> = { label: spec.name };
      if (spec.type === 'float' || spec.type === 'int') {
        Object.assign(options, { min: spec.min, max: spec.max, step: spec.step });
      }
      if (spec.isColor) options.color = { type: 'float' };

      pane
        .addBinding(state, spec.name, options)
        .on('change', (event) => onChangeRef.current(spec.name, fromPaneValue(spec, event.value)));
    }

    if (current.length === 0) {
      pane.addBlade({ view: 'text', label: 'Parameter', value: 'keine', parse: (v: string) => v });
    }

    return () => {
      pane.dispose();
      paneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  // Werte nachziehen, ohne den Pane anzufassen — etwa wenn ein Preset geladen wird.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    for (const spec of specs) {
      stateRef.current[spec.name] = toPaneValue(spec, values[spec.name] ?? spec.value);
    }
    pane.refresh();
  }, [values, specs]);

  return <div className="inspector__pane" ref={hostRef} />;
}
