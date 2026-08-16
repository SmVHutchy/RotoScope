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

export type Frame = {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Tatsaechlicher Zeitstempel des gelieferten Frames, in Sekunden. */
  timestamp: number;
};

export type LoadedClip = {
  info: ClipInfo;
  /** Frame an einer Zeitposition (Sekunden). Liefert den letzten Frame <= seconds. */
  frameAt: (seconds: number) => Promise<Frame>;
};

export async function loadClip(file: File | Blob): Promise<LoadedClip> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });

  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Die Datei enthaelt keine Videospur.');

  const [duration, width, height, codec] = await Promise.all([
    input.computeDuration(),
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    track.getCodecParameterString().catch(() => null),
  ]);

  const sink = new CanvasSink(track);

  return {
    info: { duration, width, height, codec },
    frameAt: async (seconds: number) => {
      const wrapped = await sink.getCanvas(seconds);
      if (!wrapped) throw new Error(`Kein Frame bei ${seconds}s.`);
      return { canvas: wrapped.canvas, timestamp: wrapped.timestamp };
    },
  };
}
