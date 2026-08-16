/** Client fuer die Roto-Endpunkte der Engine. */

export type Session = { session_id: string; variant: string };

export type ClickResult = {
  mask: ImageBitmap;
  score: number;
  predictMs: number;
  points: number;
};

export type EmbedResult = { cached: boolean; encodeMs: number; cacheMb: number };

const API = '/api/roto';

async function failOn(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  const detail = await res.text().catch(() => '');
  throw new Error(`${what} fehlgeschlagen (HTTP ${res.status}) ${detail}`.trim());
}

export async function createSession(variant?: string): Promise<Session> {
  const res = await fetch(`${API}/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ variant: variant ?? null }),
  });
  return (await failOn(res, 'Sitzung anlegen')).json();
}

/**
 * Frame hochladen und encodieren lassen. Teuer (~300 ms), aber genau einmal pro
 * Frame -- danach kostet jeder Klick nur noch den Decoder (ADR 002).
 */
export async function embedFrame(
  sessionId: string,
  frame: number,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<EmbedResult> {
  const blob = await canvasToPng(canvas);
  const res = await fetch(`${API}/session/${sessionId}/frames/${frame}/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'image/png' },
    body: blob,
  });
  const data = await (await failOn(res, 'Frame encodieren')).json();
  return { cached: data.cached, encodeMs: data.encode_ms, cacheMb: data.cache.mb };
}

export async function click(
  sessionId: string,
  frame: number,
  point: { x: number; y: number; positive: boolean; objectId: string },
): Promise<ClickResult> {
  const res = await fetch(`${API}/session/${sessionId}/frames/${frame}/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      x: point.x,
      y: point.y,
      positive: point.positive,
      object_id: point.objectId,
    }),
  });
  await failOn(res, 'Klick');

  return {
    mask: await createImageBitmap(await res.blob()),
    score: Number(res.headers.get('X-Score') ?? 0),
    predictMs: Number(res.headers.get('X-Predict-Ms') ?? 0),
    points: Number(res.headers.get('X-Points') ?? 0),
  };
}

function canvasToPng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob> {
  if (canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob lieferte nichts'))), 'image/png'),
  );
}
