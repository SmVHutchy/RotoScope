import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipSlot } from './ClipSlot';
import { Inspector } from './Inspector';
import { MotifPanel } from './MotifPanel';
import { EASE_NAMES, easeByName } from './ease';
import { download, exportTransition } from './export';
import { TransitionRenderer, type ParamValue } from './gl/transition';
import { loadClip, type ClipInfo, type LoadedClip } from './media';
import { byName, defaultsOf, specsOf, transitions } from './transitions';

type Slot = 'a' | 'b';

type EngineState =
  | { status: 'pruefe' }
  | { status: 'aus'; reason: string }
  | { status: 'an'; version: string; backend: string | null };


function useEngine(): EngineState {
  const [state, setState] = useState<EngineState>({ status: 'pruefe' });

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        const health = await fetch('/api/health', { signal: AbortSignal.timeout(2000) });
        if (!health.ok) throw new Error(`HTTP ${health.status}`);
        const { version } = await health.json();

        let backend: string | null = null;
        try {
          const device = await fetch('/api/device', { signal: AbortSignal.timeout(20000) });
          if (device.ok) backend = (await device.json()).preferred ?? null;
        } catch {
          /* Engine lebt, Backend unbekannt */
        }

        if (!cancelled) setState({ status: 'an', version, backend });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'aus', reason: err instanceof Error ? err.message : String(err) });
        }
      }
    };

    void check();
    const timer = setInterval(check, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  return state;
}

function EngineBadge({ state }: { state: EngineState }) {
  const label =
    state.status === 'pruefe'
      ? 'Engine wird geprüft …'
      : state.status === 'an'
        ? `Engine v${state.version} · ${state.backend ?? 'kein GPU-Backend'}`
        : 'Engine offline';

  return (
    <span className={`badge badge--${state.status}`} title={state.status === 'aus' ? state.reason : undefined}>
      <span className="badge__dot" />
      {label}
    </span>
  );
}

export function App() {
  const engine = useEngine();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<TransitionRenderer | null>(null);
  const clipsRef = useRef<{ a: LoadedClip | null; b: LoadedClip | null }>({ a: null, b: null });

  // Beide Seiten getrennt: A liefert den Ausstiegsframe, B den Einstiegsframe.
  const [infos, setInfos] = useState<{ a: ClipInfo | null; b: ClipInfo | null }>({ a: null, b: null });
  const [times, setTimes] = useState<{ a: number; b: number }>({ a: 0, b: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** Sobald A vorhanden ist, bestimmt es Ausgabeformat und Vorschau. */
  const info = infos.a ?? infos.b;

  const [name, setName] = useState('crosswarp');
  const [params, setParams] = useState<Record<string, ParamValue>>(() => defaultsOf(byName('crosswarp')));
  const [progress, setProgress] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [frameMs, setFrameMs] = useState<number | null>(null);
  const [durationFrames, setDurationFrames] = useState(24);
  const [ease, setEase] = useState('smooth');
  /** Zählt hoch, sobald neue Frames in den Texturen liegen — löst genau einen Redraw aus. */
  const [framesEpoch, setFramesEpoch] = useState(0);
  const [exporting, setExporting] = useState<
    { phase: 'idle' } | { phase: 'running'; percent: number } | { phase: 'done'; summary: string }
  >({ phase: 'idle' });

  const transition = useMemo(() => byName(name), [name]);
  const specs = useMemo(() => specsOf(transition), [transition]);

  // Stabile Identität: sonst baut das MOTIF-Panel bei jedem Renderdurchlauf
  // Dokument, Text und Hash neu — auch wenn sich inhaltlich nichts geändert hat.
  const motifInput = useMemo(
    () => ({
      name: `${transition.name.toLowerCase()}_v1`,
      glTransition: transition.name,
      durationFrames,
      ease,
      params: params as Record<string, number | boolean | number[]>,
    }),
    [transition.name, durationFrames, ease, params],
  );

  /** Übergang als MP4 herausschreiben — derselbe Renderer wie in der Vorschau. */
  const runExport = useCallback(async () => {
    const renderer = rendererRef.current;
    const canvas = canvasRef.current;
    if (!renderer || !canvas) return;

    setPlaying(false);
    setExporting({ phase: 'running', percent: 0 });
    try {
      const result = await exportTransition({
        renderer,
        canvas,
        params,
        ease: easeByName(ease),
        durationFrames,
        fps: 25,
        onProgress: (done, total) =>
          setExporting({ phase: 'running', percent: Math.round((done / total) * 100) }),
      });
      download(result.blob, `${transition.name.toLowerCase()}_v1.mp4`);
      const check = result.verified;
      setExporting({
        phase: 'done',
        summary:
          `${result.frames} Frames · ${(result.blob.size / 1024).toFixed(0)} KB · ${result.encodeMs} ms · ` +
          `geprüft: ${check.width}×${check.height}, ${check.durationSeconds.toFixed(2)} s, ${check.codec ?? '?'}`,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setExporting({ phase: 'idle' });
    }
  }, [durationFrames, ease, params, transition.name]);

  /** Ein Renderdurchgang. Getrennt gehalten, damit ihn Regler und Animation teilen. */
  const draw = useCallback((p: number, values: Record<string, ParamValue>) => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    const started = performance.now();
    renderer.render(p, values);
    setFrameMs(Math.round((performance.now() - started) * 100) / 100);
  }, []);


  /** Clip in eine Seite laden. A springt ans Ende, B an den Anfang — der Normalfall im Schnitt. */
  const loadSlot = useCallback(
    async (slot: Slot, source: Blob) => {
      setBusy(true);
      setError(null);
      try {
        const clip = await loadClip(source);
        clipsRef.current = { ...clipsRef.current, [slot]: clip };
        setInfos((prev) => ({ ...prev, [slot]: clip.info }));
        setTimes((prev) => ({
          ...prev,
          [slot]: slot === 'a' ? Math.max(0, clip.info.duration - 0.04) : 0,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  /**
   * Dekodieren — und zwar nur, wenn sich Clips oder Zeitpositionen ändern.
   *
   * Bewusst getrennt vom Zeichnen: hingen beide zusammen, würde jeder Reglerzug
   * am Inspector beide Videoframes neu dekodieren. Das kostet Größenordnungen
   * mehr als der Renderdurchgang selbst.
   *
   * Fehlt eine Seite, springt die andere ein — so ist schon nach dem ersten Clip
   * etwas zu sehen, statt einer leeren Fläche bis zum zweiten Ladevorgang.
   */
  useEffect(() => {
    const { a, b } = clipsRef.current;
    const from = a ?? b;
    const to = b ?? a;
    const canvas = canvasRef.current;
    if (!from || !to || !canvas) return;

    let cancelled = false;
    void (async () => {
      const [frameA, frameB] = await Promise.all([from.frameAt(times.a), to.frameAt(times.b)]);
      if (cancelled) return;

      const renderer = (rendererRef.current ??= new TransitionRenderer(canvas));
      renderer.setImages(
        frameA.canvas,
        frameB.canvas,
        from.info.width,
        from.info.height,
        from.info.width / from.info.height,
        to.info.width / to.info.height,
      );
      setFramesEpoch((epoch) => epoch + 1);
    })();

    // Beim schnellen Ziehen laufen mehrere Dekodierungen; nur die letzte zählt.
    return () => {
      cancelled = true;
    };
  }, [infos.a, infos.b, times.a, times.b]);

  /** Neue Frames im Renderer: einmal neu zeichnen, Parameter unangetastet lassen. */
  useEffect(() => {
    if (framesEpoch > 0) draw(progress, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [framesEpoch]);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('clip');
    if (!url) return;
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Clip nicht ladbar: HTTP ${res.status}`);
        const blob = await res.blob();
        // Zum Ausprobieren: derselbe Clip in beide Seiten, A ans Ende, B an den Anfang.
        await loadSlot('a', blob);
        await loadSlot('b', blob);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Übergang gewechselt: neu übersetzen, Defaults übernehmen, sofort zeichnen. */
  useEffect(() => {
    const renderer = rendererRef.current;
    if (!renderer || !info) return;
    try {
      renderer.use(transition);
      const defaults = defaultsOf(transition);
      setParams(defaults);
      draw(progress, defaults);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transition, info]);

  // Wiedergabe mit echter Dauer und echter Kurve: `duration` und `ease` aus der
  // .motif-Datei wirken hier, sie sind keine Dekoration.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const started = performance.now();
    const durationMs = (durationFrames / 25) * 1000;
    const curve = easeByName(ease);

    const tick = (now: number) => {
      const linear = ((now - started) % durationMs) / durationMs;
      const eased = curve(linear);
      setProgress(eased);
      draw(eased, params);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, params, draw, durationFrames, ease]);

  const onParam = useCallback(
    (key: string, value: ParamValue) => {
      setParams((prev) => {
        const next = { ...prev, [key]: value };
        draw(progress, next);
        return next;
      });
    },
    [draw, progress],
  );

  const onProgress = useCallback(
    (p: number) => {
      setProgress(p);
      draw(p, params);
    },
    [draw, params],
  );

  return (
    <main className="app app--split">
      <header className="app__head">
        <h1>RotoScope Studio</h1>
        <EngineBadge state={engine} />
      </header>

      <section className="viewer">
        <div
          className={info ? 'stack' : 'stack is-empty'}
          style={info ? { aspectRatio: `${info.width} / ${info.height}` } : undefined}
        >
          <canvas ref={canvasRef} className="stack__layer" />
        </div>

        <div className="slots">
          <ClipSlot
            label="A — raus"
            hint="Clip hierher ziehen"
            info={infos.a}
            time={times.a}
            onFile={(file) => void loadSlot('a', file)}
            onTime={(seconds) => setTimes((prev) => ({ ...prev, a: seconds }))}
          />
          <ClipSlot
            label="B — rein"
            hint="Clip hierher ziehen"
            info={infos.b}
            time={times.b}
            onFile={(file) => void loadSlot('b', file)}
            onTime={(seconds) => setTimes((prev) => ({ ...prev, b: seconds }))}
          />
        </div>

        {busy && <div className="viewer__hint">dekodiere …</div>}
        {error && <div className="viewer__hint viewer__hint--error">{error}</div>}
      </section>

      <aside className="inspector">
        <label className="field">
          <span className="field__label">Übergang</span>
          <select value={name} onChange={(e) => setName(e.target.value)}>
            {transitions.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <div className="field">
          <span className="field__label">
            progress <em>{progress.toFixed(3)}</em>
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={progress}
            onChange={(e) => onProgress(Number(e.target.value))}
          />
          <div className="motif__actions">
            <button className="button" onClick={() => setPlaying((p) => !p)}>
              {playing ? 'stopp' : 'abspielen'}
            </button>
            <button
              className="button"
              onClick={runExport}
              disabled={!info || exporting.phase === 'running'}
            >
              {exporting.phase === 'running' ? `rendert ${exporting.percent} %` : 'als MP4'}
            </button>
          </div>
          {exporting.phase === 'done' && <span className="field__label">{exporting.summary}</span>}
        </div>

        <div className="field field--row">
          <label className="field">
            <span className="field__label">Dauer</span>
            <input
              type="number"
              min={1}
              max={240}
              value={durationFrames}
              onChange={(e) => setDurationFrames(Math.max(1, Number(e.target.value)))}
            />
          </label>
          <label className="field">
            <span className="field__label">ease</span>
            <select value={ease} onChange={(e) => setEase(e.target.value)}>
              {EASE_NAMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <Inspector specs={specs} values={params} onChange={onParam} />

        <MotifPanel
          input={motifInput}
          onLoad={(loaded) => {
            setName(loaded.glTransition);
            setDurationFrames(loaded.durationFrames);
            setEase(loaded.ease);
            // Nach dem Wechsel des Übergangs setzt ein Effekt die Defaults; die
            // geladenen Werte müssen danach greifen, sonst gewinnen die Defaults.
            queueMicrotask(() => {
              setParams(loaded.params as Record<string, ParamValue>);
              draw(progress, loaded.params as Record<string, ParamValue>);
            });
          }}
        />

        <div className="inspector__foot">
          <div>
            {specs.length} Parameter · {transition.license} · {transition.author.split('<')[0].trim()}
          </div>
          {frameMs !== null && <div>Renderzeit {frameMs} ms</div>}
          <div>{transitions.length} Übergänge geladen</div>
        </div>
      </aside>

      {info && (
        <footer className="meta">
          <span>
            {info.width}×{info.height}
          </span>
          <span>{info.duration.toFixed(2)} s</span>
          <span>{info.codec ?? 'Codec unbekannt'}</span>
          <span className="meta__note">
            A {times.a.toFixed(2)} s → B {times.b.toFixed(2)} s
          </span>
        </footer>
      )}
    </main>
  );
}
