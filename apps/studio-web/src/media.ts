/**
 * Duenne Huelle um mediabunny.
 *
 * Wandert nach packages/media-io, sobald die CLI dieselben Funktionen braucht
 * (M3). Solange nur die Web-App liest, waere ein eigenes Package Ballast.
 */

import { ALL_FORMATS, BlobSource, CanvasSink, Input } from 'mediabunny';

export type ClipInfo = {
  /** Sekunden. */
  duration: number;
  width: number;
  height: number;
  codec: string | null;
};

export type LoadedClip = {
  info: ClipInfo;
  /** Frame an einer Zeitposition (Sekunden) als Canvas. */
  frameAt: (seconds: number) => Promise<HTMLCanvasElement>;
};

/**
 * `getCanvasAt` liefert je nach mediabunny-Version das Canvas direkt oder ein
 * WrappedCanvas mit Metadaten. Beides akzeptieren, statt sich an eine Form zu binden.
 */
function unwrapCanvas(result: unknown): HTMLCanvasElement {
  if (result && typeof result === 'object' && 'canvas' in result) {
    return (result as { canvas: HTMLCanvasElement }).canvas;
  }
  return result as HTMLCanvasElement;
}

export async function loadClip(file: File | Blob): Promise<LoadedClip> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Die Datei enthaelt keine Videospur.');

  const [duration, codec] = await Promise.all([
    input.computeDuration(),
    track.getCodecParameterString().catch(() => null),
  ]);

  const sink = new CanvasSink(track);

  return {
    info: {
      duration,
      width: track.displayWidth ?? track.codedWidth,
      height: track.displayHeight ?? track.codedHeight,
      codec,
    },
    frameAt: async (seconds: number) => {
      const result = await sink.getCanvasAt(seconds);
      if (!result) throw new Error(`Kein Frame bei ${seconds}s.`);
      return unwrapCanvas(result);
    },
  };
}
