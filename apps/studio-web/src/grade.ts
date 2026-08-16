/**
 * Look aus einem Referenzbild — die Brücke zwischen grade-core und dem Renderer.
 *
 * grade-core rechnet, weiß aber nichts von Canvas, Bitmaps oder Texturen. Diese
 * Schicht besorgt die Stichproben und legt das Ergebnis in der Form ab, die die
 * GPU erwartet.
 */

import {
  buildLook,
  lookToCube,
  sampleLab,
  serializeCube,
  applyRgb,
  DEFAULT_SIZE,
  type Look,
  type Method,
} from '@rotoscope/grade-core';

export type { Method };

/** Bild auf eine handliche Größe bringen und die Pixel holen. */
function pixelsOf(image: ImageBitmap | HTMLCanvasElement | OffscreenCanvas, maxEdge = 256): ImageData {
  const width = 'width' in image ? image.width : 0;
  const height = 'height' in image ? image.height : 0;
  const scale = Math.min(1, maxEdge / Math.max(width, height));

  const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('2D-Kontext für die Bildanalyse nicht verfügbar.');
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function analyseLook(
  source: ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
  reference: ImageBitmap,
  method: Method,
): Look {
  // Verkleinert reichen wenige zehntausend Punkte, um Mittelwert und Kovarianz
  // stabil zu schätzen — die volle Auflösung würde nur Zeit kosten.
  return buildLook(
    sampleLab(pixelsOf(source).data, 1),
    sampleLab(pixelsOf(reference).data, 1),
    method,
  );
}

/**
 * Look als gekachelte LUT-Textur backen.
 *
 * Layout wie im Shader erwartet: `size` Scheiben nebeneinander, Breite `size*size`,
 * Höhe `size`, RGBA8.
 */
export function bakeLutTiles(look: Look, size = DEFAULT_SIZE): Uint8Array {
  const tiles = new Uint8Array(size * size * size * 4);
  const last = size - 1;

  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        // Mix bleibt hier 1: die Stärke regelt der Shader, damit der Regler ohne
        // erneutes Backen reagiert.
        const [outR, outG, outB] = applyRgb(look, [r / last, g / last, b / last], 1);
        const x = b * size + r;
        const index = (g * size * size + x) * 4;
        tiles[index] = Math.round(outR * 255);
        tiles[index + 1] = Math.round(outG * 255);
        tiles[index + 2] = Math.round(outB * 255);
        tiles[index + 3] = 255;
      }
    }
  }
  return tiles;
}

/** `.cube` für Resolve, Lumetri und Premiere. Hier wirkt der Mischregler mit. */
export function lookToCubeText(look: Look, mix: number, title: string): string {
  return serializeCube(lookToCube(look, mix, DEFAULT_SIZE, title));
}
