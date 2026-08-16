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
  /**
   * Mehrere Frames auf einmal.
   *
   * Nicht dasselbe wie `frameAt` in einer Schleife: bei aufsteigenden Zeitstempeln
   * dekodiert mediabunny jedes Paket nur einmal statt für jeden Frame neu zu
   * springen. Genau das braucht der bewegte Übergang, der 24 bis 48 Frames am
   * Stück anfordert.
   */
  framesAt: (timestamps: number[]) => Promise<ImageBitmap[]>;
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

    framesAt: async (timestamps: number[]) => {
      const frames: ImageBitmap[] = [];
      for await (const wrapped of sink.canvasesAtTimestamps(timestamps)) {
        // Der Sink recycelt sein Canvas — ohne Kopie zeigen am Ende alle Einträge
        // auf denselben, zuletzt gezeichneten Inhalt.
        if (wrapped) frames.push(await createImageBitmap(wrapped.canvas));
        // Vor dem ersten und nach dem letzten echten Frame gibt es nichts zu holen;
        // dann bleibt das zuletzt gültige Bild stehen, statt eine Lücke zu erzeugen.
        else if (frames.length) frames.push(frames[frames.length - 1]);
      }
      if (!frames.length) throw new Error('Keine Frames im angefragten Bereich.');
      return frames;
    },
  };
}
