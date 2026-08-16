/**
 * Die .motif-Datei sichtbar machen — und Snapshots statt Presets (UC-C2, UC-C3).
 *
 * Ein Preset ist hier ein approvter, aufklappbarer Snapshot mit Hash und Zeitstempel,
 * nie eine Kiste mit drei Reglern. Wer einen Snapshot laedt, sieht denselben Text,
 * aus dem er entstanden ist.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildDocument, hashDocument, parse, serialize, toMir, type BuildInput } from '@rotoscope/motif-lang';

const STORAGE_KEY = 'rotoscope.snapshots.v1';

export type Snapshot = {
  hash: string;
  at: string;
  label: string;
  source: string;
};

type Props = {
  input: BuildInput;
  onLoad: (input: { glTransition: string; durationFrames: number; ease: string; params: Record<string, number | boolean | number[]> }) => void;
};

function readSnapshots(): Snapshot[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function MotifPanel({ input, onLoad }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>(readSnapshots);
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { text, hash, error } = useMemo(() => {
    try {
      const doc = buildDocument(input);
      return { text: serialize(doc), hash: hashDocument(doc), error: null };
    } catch (err) {
      return { text: '', hash: '', error: err instanceof Error ? err.message : String(err) };
    }
  }, [input]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
  }, [snapshots]);

  const alreadyApproved = snapshots.some((s) => s.hash === hash);

  const approve = () => {
    if (alreadyApproved) {
      setMessage('Dieser Stand ist bereits approved — gleicher Hash.');
      return;
    }
    setSnapshots((prev) => [
      { hash, at: new Date().toISOString(), label: input.glTransition, source: text },
      ...prev,
    ]);
    setMessage(`approved ${hash}`);
  };

  const save = () => {
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${input.name}.motif`;
    link.click();
    URL.revokeObjectURL(url);
  };

  /** Text einlesen und zurueck in den UI-Zustand geben — Text und UI sind bidirektional. */
  const apply = (source: string) => {
    try {
      const mir = toMir(parse(source));
      const params: Record<string, number | boolean | number[]> = {};
      for (const [key, param] of Object.entries(mir.params)) {
        if (param.type === 'const') params[key] = param.value as number | boolean | number[];
        else params[key] = param.from;
      }
      onLoad({
        glTransition: mir.source.replace(/^gl:/, ''),
        durationFrames: mir.durationMs ? Math.round((mir.durationMs / 1000) * 25) : 24,
        ease: mir.ease.replace(/\(.*\)$/, ''),
        params,
      });
      setMessage(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="motif">
      <div className="motif__bar">
        <span className="field__label">
          .motif <em>{hash}</em>
        </span>
        <div className="motif__actions">
          <button className="button" onClick={approve} disabled={!!error}>
            {alreadyApproved ? 'approved' : 'approve'}
          </button>
          <button className="button" onClick={save} disabled={!!error}>
            speichern
          </button>
          <button className="button" onClick={() => fileRef.current?.click()}>
            laden
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".motif,text/plain"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (file) apply(await file.text());
              event.target.value = '';
            }}
          />
        </div>
      </div>

      <pre className="motif__text">{error ?? text}</pre>
      {message && <div className="motif__message">{message}</div>}

      {snapshots.length > 0 && (
        <div className="motif__snapshots">
          <span className="field__label">
            Snapshots <em>{snapshots.length}</em>
          </span>
          {snapshots.map((snapshot) => (
            <button
              key={snapshot.hash + snapshot.at}
              className={`snapshot${snapshot.hash === hash ? ' snapshot--current' : ''}`}
              onClick={() => apply(snapshot.source)}
              title={snapshot.source}
            >
              <code>{snapshot.hash}</code>
              <span>{snapshot.label}</span>
              <time>{new Date(snapshot.at).toLocaleTimeString('de-DE')}</time>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
