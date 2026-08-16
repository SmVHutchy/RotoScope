/** Kopfzeile: Wortmarke, Moduswechsel, Engine-Zustand. Fuer beide Ansichten. */

import { useEffect, useState } from 'react';

export type Mode = 'transition' | 'field';

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

export function Header({ mode, onMode }: { mode: Mode; onMode: (mode: Mode) => void }) {
  const state = useEngine();

  const label =
    state.status === 'pruefe'
      ? 'Engine wird gesucht ...'
      : state.status === 'an'
        ? `Engine v${state.version} / ${state.backend ?? 'kein GPU-Backend'}`
        : 'Engine offline';

  return (
    <header className="app__head">
      <h1>RotoScope Studio</h1>

      <nav className="modes">
        {(['transition', 'field'] as Mode[]).map((candidate) => (
          <button
            key={candidate}
            className={`button${mode === candidate ? ' button--active' : ''}`}
            onClick={() => onMode(candidate)}
          >
            {candidate === 'transition' ? 'Transitions' : 'Felder'}
          </button>
        ))}
      </nav>

      <span
        className={`badge badge--${state.status}`}
        title={state.status === 'aus' ? state.reason : undefined}
      >
        <span className="badge__dot" />
        {label}
      </span>
    </header>
  );
}
