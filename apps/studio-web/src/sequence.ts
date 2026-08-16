/**
 * Die beiden Frame-Folgen eines Übergangs.
 *
 * Ein Übergang zwischen zwei Standbildern ist ein Sonderfall des bewegten: dort
 * stehen beide Seiten still. Deshalb gibt es hier nur einen Weg — Sequenzen —
 * statt zweier Codepfade, die auseinanderlaufen können.
 *
 * Das Schnittmodell dahinter ist das aus dem Schneideraum: A spielt seine letzten
 * `duration` Frames bis zum gewählten Ausstiegspunkt, B spielt seine ersten
 * `duration` Frames ab dem gewählten Einstiegspunkt. Beide laufen während der
 * Überblendung gleichzeitig weiter.
 */

import type { LoadedClip } from './media';

export type Sequence = {
  a: ImageBitmap[];
  b: ImageBitmap[];
  /** Wie viele Frames der Übergang selbst umfasst (ohne Vor- und Nachlauf). */
  length: number;
};

export type SequenceRequest = {
  clipA: LoadedClip;
  clipB: LoadedClip;
  /** Ausstiegspunkt in A und Einstiegspunkt in B, in Sekunden. */
  timeA: number;
  timeB: number;
  durationFrames: number;
  fps: number;
  /** Standbild wiederholen statt zu bewegen — für die schnelle Vorschau. */
  frozen?: boolean;
};

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(0, max));

/** Zeitstempel für eine Seite berechnen, auf die Cliplänge begrenzt. */
function timestamps(request: SequenceRequest, side: 'a' | 'b'): number[] {
  const { durationFrames, fps, frozen } = request;
  const isA = side === 'a';
  const anchor = isA ? request.timeA : request.timeB;
  const limit = (isA ? request.clipA : request.clipB).info.duration - 1 / fps;

  return Array.from({ length: durationFrames }, (_, index) => {
    if (frozen) return clamp(anchor, limit);
    // A endet auf dem Ausstiegsframe, B beginnt auf dem Einstiegsframe.
    const offset = isA ? -(durationFrames - 1 - index) / fps : index / fps;
    return clamp(anchor + offset, limit);
  });
}

export async function loadSequence(request: SequenceRequest): Promise<Sequence> {
  // Beide Seiten parallel: sie hängen nicht voneinander ab, und das Dekodieren
  // ist der teuerste Teil des Vorgangs.
  const [a, b] = await Promise.all([
    request.clipA.framesAt(timestamps(request, 'a')),
    request.clipB.framesAt(timestamps(request, 'b')),
  ]);
  return { a, b, length: Math.min(a.length, b.length) };
}

/** Frame-Index zu einem Fortschritt zwischen 0 und 1. */
export function indexAt(sequence: Sequence, progress: number): number {
  return clamp(Math.round(progress * (sequence.length - 1)), sequence.length - 1);
}

export function closeSequence(sequence: Sequence | null): void {
  if (!sequence) return;
  // Doppelt vorkommende Bitmaps (aufgefüllte Lücken) nur einmal schließen.
  for (const bitmap of new Set([...sequence.a, ...sequence.b])) bitmap.close();
}
