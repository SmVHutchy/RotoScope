/**
 * Eine Seite des Übergangs: Clip laden und den Frame wählen (UC-B1).
 *
 * A liefert den Ausstiegsframe, B den Einstiegsframe. Die Voreinstellung ist
 * genau der Normalfall im Schnitt — A endet, B beginnt — aber der Frame bleibt
 * frei wählbar, weil der letzte Frame oft der schlechteste ist (Bewegungsunschärfe,
 * jemand läuft aus dem Bild).
 */

import type { ClipInfo } from './media';

type Props = {
  label: string;
  hint: string;
  info: ClipInfo | null;
  time: number;
  onFile: (file: File) => void;
  onTime: (seconds: number) => void;
};

export function ClipSlot({ label, hint, info, time, onFile, onTime }: Props) {
  return (
    <div
      className={`slot${info ? ' slot--filled' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <div className="slot__head">
        <strong>{label}</strong>
        <span>{info ? `${info.width}×${info.height} · ${info.duration.toFixed(2)} s` : hint}</span>
      </div>

      <input
        type="file"
        accept="video/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />

      {info && (
        <label className="field">
          <span className="field__label">
            Frame <em>{time.toFixed(2)} s</em>
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(0, info.duration - 0.04)}
            step={0.04}
            value={time}
            onChange={(e) => onTime(Number(e.target.value))}
          />
        </label>
      )}
    </div>
  );
}
