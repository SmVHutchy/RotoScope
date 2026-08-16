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
  type RasterMode,
} from '@rotoscope/field-core';
import { Inspector } from './Inspector';
import { FieldRenderer } from './field/FieldRenderer';
import { applyFieldParam, fieldSpecs } from './field/specs';
import { download, exportFrames } from './export';
import { FPS } from './project';
import type { ParamValue } from './gl/transition';

const SIZE = 1024;
const COMBINE_MODES: CombineMode[] = ['union', 'smooth', 'subtract', 'intersect'];
const MIRROR_AXES: MirrorAxis[] = ['none', 'x', 'y', 'both'];
const RASTER_MODES: RasterMode[] = ['none', 'dots', 'blocks'];

export function FieldView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<FieldRenderer | null>(null);

  const [presetName, setPresetName] = useState(FIELD_PRESETS[0].name);
  const [graph, setGraph] = useState<FieldGraph>(() => fieldPresetByName(FIELD_PRESETS[0].name).graph);
  const [error, setError] = useState<string | null>(null);
  const [frameMs, setFrameMs] = useState<number | null>(null);
  const [phase, setPhase] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);

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

  const draw = useCallback((next: FieldGraph, at = 0) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      const started = performance.now();
      renderer.render(next, at);
      setFrameMs(Math.round((performance.now() - started) * 100) / 100);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    draw(graph, phase);
  }, [graph, phase, draw]);

  // Wiedergabe: die Phase laeuft von 0 bis 1 und beginnt von vorn.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const started = performance.now();
    const durationMs = (graph.motion.durationFrames / FPS) * 1000;
    const tick = (now: number) => {
      setPhase(((now - started) % durationMs) / durationMs);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, graph.motion.durationFrames]);

  /** Einen vollen Durchlauf herausschreiben — Phase 0 bis knapp vor 1. */
  const exportLoop = useCallback(async () => {
    const canvas = canvasRef.current;
    const renderer = rendererRef.current;
    if (!canvas || !renderer) return;

    setPlaying(false);
    setExporting('0 %');
    try {
      const total = Math.round(graph.motion.durationFrames);
      const result = await exportFrames({
        canvas,
        total,
        fps: FPS,
        // Der letzte Frame liegt bei (total-1)/total, nicht bei 1 -- sonst waere er
        // mit dem ersten identisch und der Loop haette einen doppelten Frame.
        renderFrame: (index) => renderer.render(graph, index / total),
        onProgress: (done, all) => setExporting(`${Math.round((done / all) * 100)} %`),
      });
      download(result.blob, `${presetName.toLowerCase()}_loop.mp4`);
      const check = result.verified;
      setExporting(
        `${result.frames} Frames / ${(result.blob.size / 1024).toFixed(0)} KB / ` +
          `verifiziert: ${check.width}x${check.height}, ${check.durationSeconds.toFixed(2)} s`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setExporting(null);
    }
  }, [graph, presetName]);

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

        <label className="field">
          <span className="field__label">Raster</span>
          <select
            value={graph.raster.mode}
            onChange={(e) =>
              update({ ...graph, raster: { ...graph.raster, mode: e.target.value as RasterMode } })
            }
          >
            {RASTER_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>

        <Inspector specs={specs} values={values} onChange={onParam} />

        <div className="field">
          <span className="field__label">
            phase <em>{phase.toFixed(3)}</em>
          </span>
          <input
            type="range"
            min={0}
            max={0.999}
            step={0.001}
            value={phase}
            onChange={(e) => setPhase(Number(e.target.value))}
          />
        </div>

        <div className="motif__actions">
          <button className="button" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'stopp' : 'abspielen'}
          </button>
          <button className="button" onClick={savePng}>
            als PNG
          </button>
          <button
            className="button"
            onClick={exportLoop}
            disabled={exporting !== null && exporting.endsWith('%')}
          >
            {exporting !== null && exporting.endsWith('%') ? `rendert ${exporting}` : 'Loop als MP4'}
          </button>
        </div>
        {exporting !== null && !exporting.endsWith('%') && (
          <span className="field__label">{exporting}</span>
        )}

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
