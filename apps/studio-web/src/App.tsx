import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Inspector } from './Inspector';
import { MotifPanel } from './MotifPanel';
import { EASE_NAMES, easeByName } from './ease';
import { TransitionRenderer, type ParamValue } from './gl/transition';
import { loadClip, type ClipInfo, type Frame } from './media';
import { byName, defaultsOf, specsOf, transitions } from './transitions';

type EngineState =
  | { status: 'pruefe' }
  | { status: 'aus'; reason: string }
  | { status: 'an'; version: string; backend: string | null };

/** Wo die beiden Frames im Clip liegen, zwischen denen der Übergang läuft. */
const FROM_AT = 0;
const TO_FRACTION = 0.6;

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
  const framesRef = useRef<{ from: Frame; to: Frame } | null>(null);

  const [info, setInfo] = useState<ClipInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState('crosswarp');
  const [params, setParams] = useState<Record<string, ParamValue>>(() => defaultsOf(byName('crosswarp')));
  const [progress, setProgress] = useState(0.5);
  const [playing, setPlaying] = useState(false);
  const [frameMs, setFrameMs] = useState<number | null>(null);
  const [durationFrames, setDurationFrames] = useState(24);
  const [ease, setEase] = useState('smooth');

  const transition = useMemo(() => byName(name), [name]);
  const specs = useMemo(() => specsOf(transition), [transition]);

  /** Ein Renderdurchgang. Getrennt gehalten, damit ihn Regler und Animation teilen. */
  const draw = useCallback((p: number, values: Record<string, ParamValue>) => {
    const renderer = rendererRef.current;
    if (!renderer || !framesRef.current) return;
    const started = performance.now();
    renderer.render(p, values);
    setFrameMs(Math.round((performance.now() - started) * 100) / 100);
  }, []);

  const open = useCallback(
    async (source: Blob) => {
      setBusy(true);
      setError(null);
      setInfo(null);

      try {
        const clip = await loadClip(source);
        // Zwei Frames aus demselben Clip: Anfang und ein Stück später. Damit hat
        // der Übergang echtes Material statt Testbilder (UC-B1).
        const [from, to] = await Promise.all([
          clip.frameAt(FROM_AT),
          clip.frameAt(clip.info.duration * TO_FRACTION),
        ]);
        framesRef.current = { from, to };

        const canvas = canvasRef.current;
        if (!canvas) return;
        if (!rendererRef.current) rendererRef.current = new TransitionRenderer(canvas);

        rendererRef.current.setImages(from.canvas, to.canvas, clip.info.width, clip.info.height);
        rendererRef.current.use(transition);
        setInfo(clip.info);
        draw(progress, params);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [draw, params, progress, transition],
  );

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('clip');
    if (!url) return;
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Clip nicht ladbar: HTTP ${res.status}`);
        await open(await res.blob());
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // Nur beim Start: der Clip-Parameter ändert sich nicht während der Sitzung.
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

      <section
        className="viewer"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const file = e.dataTransfer.files[0];
          if (file) void open(file);
        }}
      >
        <div
          className={info ? 'stack' : 'stack is-empty'}
          style={info ? { aspectRatio: `${info.width} / ${info.height}` } : undefined}
        >
          <canvas ref={canvasRef} className="stack__layer" />
        </div>

        {!info && !busy && (
          <div className="viewer__hint">
            <p>Video hierher ziehen oder auswählen.</p>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void open(file);
              }}
            />
          </div>
        )}
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
          <button className="button" onClick={() => setPlaying((p) => !p)}>
            {playing ? 'stopp' : 'abspielen'}
          </button>
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
          input={{
            name: `${transition.name.toLowerCase()}_v1`,
            glTransition: transition.name,
            durationFrames,
            ease,
            params: params as Record<string, number | boolean | number[]>,
          }}
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
            Frame 0 → Frame bei {(info.duration * TO_FRACTION).toFixed(2)} s
          </span>
        </footer>
      )}
    </main>
  );
}
