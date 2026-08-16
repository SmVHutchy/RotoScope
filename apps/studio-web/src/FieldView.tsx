/**
 * Der Feldgenerator: zweite Ansicht neben der Transition-Werkbank.
 *
 * Teilt sich Inspector, Formensprache und Exportweg mit ihr; eigen sind nur der
 * Viewer ohne Clip-Slots und der Feldgraph (Spec §3).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FIELD_PRESETS,
  MAX_SHAPES,
  PRESETS,
  fieldPresetByName,
  presetByName,
  type FieldGraph,
  type CombineMode,
  type MirrorAxis,
} from '@rotoscope/field-core';
import { Inspector } from './Inspector';
import { FieldRenderer } from './field/FieldRenderer';
import { applyFieldParam, fieldSpecs } from './field/specs';
import { download } from './export';
import type { ParamValue } from './gl/transition';

const SIZE = 1024;
const COMBINE_MODES: CombineMode[] = ['union', 'smooth', 'subtract', 'intersect'];
const MIRROR_AXES: MirrorAxis[] = ['none', 'x', 'y', 'both'];

export function FieldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);

  const [presetName, setPresetName] = useState(FIELD_PRESETS[0].name);
  const [graph, setGraph] = useState<FieldGraph>(() => fieldPresetByName(FIELD_PRESETS[0].name).graph);
  const [error, setError] = useState<string | null>(null);
  const [frameMs, setFrameMs] = useState<number | null>(null);

  const specs = useMemo(() => fieldSpecs(graph), [graph]);
  const values = useMemo(
    () => Object.fromEntries(specs.map((s) => [s.name, s.value])) as Record<string, ParamValue>,
    [specs],
  );

  // Genau ein Renderer je Montierung, mit Aufraeumen: sonst teilen sich zwei
  // Instanzen einen GL-Kontext und ueberschreiben sich gegenseitig.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const renderer = new FieldRenderer(canvas);
      renderer.setSize(SIZE, SIZE);
      rendererRef.current = renderer;
      setError(null);
      return () => {
        renderer.dispose();
        rendererRef.current = null;
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return;
    }
  }, []);

  const draw = useCallback((next: FieldGraph) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      const started = performance.now();
      renderer.render(next);
      setFrameMs(Math.round((performance.now() - started) * 100) / 100);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    draw(graph);
  }, [graph, draw]);

  const update = useCallback((next: FieldGraph) => setGraph(next), []);

  const onParam = useCallback(
    (name: string, value: ParamValue) => setGraph((prev) => applyFieldParam(prev, name, value)),
    [],
  );

  const savePng = useCallback(() => {
    canvasRef.current?.toBlob((blob) => {
      if (blob) download(blob, `${presetName.toLowerCase()}_feld.png`);
    }, 'image/png');
  }, [presetName]);

  const note = fieldPresetByName(presetName).note;

  return (
    <>
      <section className="viewer">
        <div className="stack" style={{ aspectRatio: '1 / 1' }}>
          <canvas ref={canvasRef} className="stack__layer" />
        </div>
        {error && <div className="viewer__hint viewer__hint--error">{error}</div>}
      </section>

      <aside className="inspector">
        <label className="field">
          <span className="field__label">Feld</span>
          <select
            value={presetName}
            onChange={(e) => {
              setPresetName(e.target.value);
              update(fieldPresetByName(e.target.value).graph);
            }}
          >
            {FIELD_PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field__label">Palette</span>
          <select
            value={graph.palette.name}
            onChange={(e) => update({ ...graph, palette: presetByName(e.target.value) })}
          >
            {PRESETS.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field field--row">
          <label className="field">
            <span className="field__label">Verband</span>
            <select
              value={graph.combineMode}
              onChange={(e) => update({ ...graph, combineMode: e.target.value as CombineMode })}
            >
              {COMBINE_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Spiegel</span>
            <select
              value={graph.mirrorAxis}
              onChange={(e) => update({ ...graph, mirrorAxis: e.target.value as MirrorAxis })}
            >
              {MIRROR_AXES.map((axis) => (
                <option key={axis} value={axis}>
                  {axis}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Inspector specs={specs} values={values} onChange={onParam} />

        <div className="motif__actions">
          <button className="button" onClick={savePng}>
            als PNG
          </button>
        </div>

        <div className="inspector__foot">
          <div>
            {graph.shapes.length} / {MAX_SHAPES} Formen / {specs.length} Parameter
          </div>
          {frameMs !== null && <div>Renderzeit {frameMs} ms</div>}
          <div className="credit">{note}</div>
        </div>
      </aside>
    </>
  );
}
