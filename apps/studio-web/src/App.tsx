import { useCallback, useEffect, useRef, useState } from 'react';
import { loadClip, type ClipInfo } from './media';
import { click as sendClick, createSession, embedFrame, type Session } from './roto';

type EngineState =
  | { status: 'pruefe' }
  | { status: 'aus'; reason: string }
  | { status: 'an'; version: string; backend: string | null };

/** Was der Nutzer nach einem Klick sehen soll. */
type RotoState = {
  session: Session | null;
  encodeMs: number | null;
  predictMs: number | null;
  score: number | null;
  points: number;
  busy: boolean;
};

const EMPTY_ROTO: RotoState = {
  session: null,
  encodeMs: null,
  predictMs: null,
  score: null,
  points: 0,
  busy: false,
};

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
          /* Engine lebt, Backend unbekannt — kein Grund, den Badge rot zu faerben */
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
        : 'Engine offline — npm run engine';

  return (
    <span className={`badge badge--${state.status}`} title={state.status === 'aus' ? state.reason : undefined}>
      <span className="badge__dot" />
      {label}
    </span>
  );
}

export function App() {
  const engine = useEngine();
  const plateRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<ClipInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roto, setRoto] = useState<RotoState>(EMPTY_ROTO);

  const open = useCallback(async (source: Blob) => {
    setBusy(true);
    setError(null);
    setInfo(null);
    setRoto(EMPTY_ROTO);

    try {
      const started = performance.now();
      const clip = await loadClip(source);
      const frame = await clip.frameAt(0);
      const decodeMs = Math.round(performance.now() - started);

      const plate = plateRef.current;
      const mask = maskRef.current;
      if (!plate || !mask) return;

      for (const canvas of [plate, mask]) {
        canvas.width = frame.canvas.width;
        canvas.height = frame.canvas.height;
      }
      plate.getContext('2d')?.drawImage(frame.canvas, 0, 0);
      mask.getContext('2d')?.clearRect(0, 0, mask.width, mask.height);

      setInfo(clip.info);
      console.info(`[M0] Frame t=${frame.timestamp}s dekodiert in ${decodeMs} ms`);

      // Sitzung anlegen und Frame 0 vorwaermen, damit der erste Klick sofort sitzt.
      const session = await createSession();
      setRoto({ ...EMPTY_ROTO, session, busy: true });
      const embedded = await embedFrame(session.session_id, 0, plate);
      setRoto((prev) => ({ ...prev, encodeMs: embedded.encodeMs, busy: false }));
      console.info(`[M1] Frame 0 encodiert in ${embedded.encodeMs} ms (${session.variant})`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, []);

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

  /** Klick ins Bild: Alt/Rechtsklick zieht ab, normaler Klick fügt hinzu (UC-A3). */
  const onCanvasClick = useCallback(
    async (event: React.MouseEvent<HTMLDivElement>) => {
      const session = roto.session;
      const plate = plateRef.current;
      const mask = maskRef.current;
      if (!session || !plate || !mask) return;

      const rect = plate.getBoundingClientRect();
      // Anzeigefläche -> Bildkoordinaten. Ohne diese Umrechnung landet der Prompt
      // bei skalierter Darstellung an der falschen Stelle.
      const x = ((event.clientX - rect.left) / rect.width) * plate.width;
      const y = ((event.clientY - rect.top) / rect.height) * plate.height;

      // Ein Prompt ausserhalb des Bildes ist kein Prompt. SAM 2 liefert darauf eine
      // Vollbildmaske mit Score 0 statt eines Fehlers — also hier abfangen.
      if (x < 0 || y < 0 || x >= plate.width || y >= plate.height) return;

      const positive = !(event.altKey || event.button === 2);

      setRoto((prev) => ({ ...prev, busy: true }));
      try {
        const result = await sendClick(session.session_id, 0, {
          x,
          y,
          positive,
          objectId: 'obj_1',
        });

        const ctx = mask.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, mask.width, mask.height);
          // Maske als farbige Fläche: erst die Maske zeichnen, dann per source-in
          // einfärben. Billiger als pixelweise Manipulation.
          ctx.drawImage(result.mask, 0, 0);
          ctx.globalCompositeOperation = 'source-in';
          ctx.fillStyle = 'rgba(56, 189, 248, 0.55)';
          ctx.fillRect(0, 0, mask.width, mask.height);
          ctx.globalCompositeOperation = 'source-over';
        }

        setRoto((prev) => ({
          ...prev,
          predictMs: result.predictMs,
          score: result.score,
          points: result.points,
          busy: false,
        }));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setRoto((prev) => ({ ...prev, busy: false }));
      }
    },
    [roto.session],
  );

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
        <div
          className={info ? 'stack' : 'stack is-empty'}
          // Der Container traegt das Seitenverhaeltnis, damit sein Rechteck exakt
          // dem der Canvases entspricht — Voraussetzung fuer korrekte Klickpunkte.
          style={info ? { aspectRatio: `${info.width} / ${info.height}` } : undefined}
          onClick={onCanvasClick}
          onContextMenu={(e) => {
            e.preventDefault();
            void onCanvasClick(e);
          }}
        >
          <canvas ref={plateRef} className="stack__layer" />
          <canvas ref={maskRef} className="stack__layer stack__layer--mask" />
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

      {info && (
        <footer className="meta">
          <span>
            {info.width}×{info.height}
          </span>
          <span>{info.duration.toFixed(2)} s</span>
          <span>{info.codec ?? 'Codec unbekannt'}</span>
          {roto.session && <span>{roto.session.variant}</span>}
          {roto.encodeMs !== null && <span>embed {roto.encodeMs} ms</span>}
          {roto.predictMs !== null && (
            <span className="meta__live">
              klick {roto.predictMs} ms · score {roto.score?.toFixed(3)} ·{' '}
              {roto.points} {roto.points === 1 ? 'Punkt' : 'Punkte'}
            </span>
          )}
          <span className="meta__note">
            {roto.busy ? 'rechnet …' : 'Klick setzt Punkt · Alt-Klick zieht ab'}
          </span>
        </footer>
      )}
    </main>
  );
}
