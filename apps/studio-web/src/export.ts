/**
 * Übergang als Videodatei ausgeben.
 *
 * Kodiert wird dort, wo auch gerendert wird: im Browser, über WebCodecs. Kein
 * ffmpeg, kein Server, keine zweite GLSL-Umgebung — der Frame, der exportiert
 * wird, ist derselbe, den der Nutzer vorher im Viewer gesehen hat. Damit kann
 * Vorschau und Ausgabe gar nicht auseinanderlaufen.
 *
 * Der echte headless-Pfad (`rotoc render` ohne Browser) braucht eine eigene
 * GL-Umgebung in Node und ist bewusst ein späterer, eigener Schritt.
 */

import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
} from 'mediabunny';
import type { EaseFn } from './ease';
import type { ParamValue, TransitionRenderer } from './gl/transition';

export type ExportOptions = {
  renderer: TransitionRenderer;
  canvas: HTMLCanvasElement;
  params: Record<string, ParamValue>;
  ease: EaseFn;
  durationFrames: number;
  fps: number;
  /** Standbilder am Anfang und Ende, damit der Schnitt lesbar ist. */
  holdFrames?: number;
  onProgress?: (done: number, total: number) => void;
};

export type ExportResult = {
  blob: Blob;
  frames: number;
  durationSeconds: number;
  encodeMs: number;
  /** Ergebnis der Selbstprüfung: so sieht die Datei aus, wenn man sie wieder öffnet. */
  verified: { width: number; height: number; durationSeconds: number; codec: string | null };
};

/**
 * Die geschriebene Datei sofort wieder aufmachen.
 *
 * Ein Encoder, der stillschweigend Unbrauchbares ausgibt, ist schlimmer als einer,
 * der abbricht — der Fehler faellt sonst erst beim Kunden auf. Kostet nur das Lesen
 * der Kopfdaten, nicht das Dekodieren des Materials.
 */
async function verify(blob: Blob): Promise<ExportResult['verified']> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(blob) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error('Die geschriebene Datei enthält keine lesbare Videospur.');

  const [width, height, durationSeconds, codec] = await Promise.all([
    track.getDisplayWidth(),
    track.getDisplayHeight(),
    input.computeDuration(),
    track.getCodecParameterString().catch(() => null),
  ]);

  if (durationSeconds <= 0) throw new Error('Die geschriebene Datei hat keine Laufzeit.');
  return { width, height, durationSeconds, codec };
}

export async function exportTransition(options: ExportOptions): Promise<ExportResult> {
  const { renderer, canvas, params, ease, durationFrames, fps, onProgress } = options;
  const hold = options.holdFrames ?? Math.round(fps * 0.25);
  const total = hold + durationFrames + hold;

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'avc', quality: new Quality('high') });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const started = performance.now();
  const frameDuration = 1 / fps;

  for (let index = 0; index < total; index++) {
    // Vorlauf haelt bei 0, Nachlauf bei 1 — dazwischen laeuft die Kurve.
    const linear =
      index < hold ? 0 : index >= hold + durationFrames ? 1 : (index - hold) / durationFrames;
    renderer.render(ease(linear), params);

    // add() awaiten: es respektiert den Gegendruck von Encoder und Writer.
    // Ohne das laeuft der Speicher bei laengeren Uebergaengen voll.
    await source.add(index * frameDuration, frameDuration);
    onProgress?.(index + 1, total);
  }

  await output.finalize();
  const buffer = (output.target as BufferTarget).buffer;
  if (!buffer) throw new Error('Der Export hat keine Daten geliefert.');

  const blob = new Blob([buffer], { type: 'video/mp4' });
  return {
    blob,
    frames: total,
    durationSeconds: total / fps,
    encodeMs: Math.round(performance.now() - started),
    verified: await verify(blob),
  };
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
