import { useCallback, useEffect, useRef, useState } from 'react';
import { loadClip, type ClipInfo } from './media';

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

        // Fehlt /device, ist die Engine trotzdem oben -- Backend bleibt dann unbekannt.
        let backend: string | null = null;
        try {
          const device = await fetch('/api/device', { signal: AbortSignal.timeout(2000) });
          if (device.ok) backend = (await device.json()).preferred ?? null;
        } catch {
          /* egal */
        }

        if (!cancelled) setState({ status: 'an', version, backend });
      } catch (err) {
        if (!cancelled) {
          setState({ status: 'aus', reason: err instanceof Error ? err.message : String(err) });
        }
      }
    };

    void check();
    const timer = setInterval(check, 5000);
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
        : `Engine offline — npm run engine`;

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
  const [info, setInfo] = useState<ClipInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const open = useCallback(async (source: Blob) => {
    setBusy(true);
    setError(null);
    setInfo(null);

    try {
      const started = performance.now();
      const clip = await loadClip(source);
      const frame = await clip.frameAt(0);
      const decodeMs = Math.round(performance.now() - started);

      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = frame.canvas.width;
      canvas.height = frame.canvas.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D-Kontext nicht verfügbar.');
      ctx.drawImage(frame.canvas, 0, 0);

      setInfo(clip.info);
      console.info(`[M0] Frame bei t=${frame.timestamp}s dekodiert und gezeichnet in ${decodeMs} ms`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

  // ?clip=<url> laedt direkt beim Start. Gedacht fuer Verifikation und spaeter fuer
  // die Uebergabe aus CLI/Tauri -- spart in M0 das manuelle Klicken bei jedem Test.
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
  }, [open]);

  return (
    <main className="app">
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
        <canvas ref={canvasRef} className={info ? 'viewer__canvas' : 'viewer__canvas is-empty'} />
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

      {info && (
        <footer className="meta">
          <span>
            {info.width}×{info.height}
          </span>
          <span>{info.duration.toFixed(2)} s</span>
          <span>{info.codec ?? 'Codec unbekannt'}</span>
          <span className="meta__note">Frame 0 — M0-Abnahme</span>
        </footer>
      )}
    </main>
  );
}
