"""HTTP-Endpunkte fuer die Roto-Sitzungen.

Bewusst ohne Multipart: der Frame kommt als roher Bildkoerper, der Klick als JSON.
Das spart eine Abhaengigkeit und trennt die teure Operation (Frame hochladen und
encodieren) sauber von der billigen (klicken) -- dieselbe Grenze wie in ADR 002.
"""

from __future__ import annotations

import io
import logging

import numpy as np
from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from . import models, roto

log = logging.getLogger("rotoscope.api")

router = APIRouter(prefix="/roto", tags=["roto"])


def _decode_image(data: bytes) -> np.ndarray:
    from PIL import Image

    if not data:
        raise HTTPException(400, "Leerer Bildkoerper.")
    try:
        image = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception as err:  # noqa: BLE001 -- Pillow wirft viele Varianten
        raise HTTPException(400, f"Bild nicht lesbar: {err}") from err
    return np.array(image)


def _encode_mask_png(mask: np.ndarray) -> bytes:
    """Maske als PNG mit echtem Alphakanal (Graustufen + Alpha).

    Nicht als reines Graustufenbild: ohne Alphakanal sind auch die schwarzen Pixel
    deckend, und jede Compositing-Operation im Browser faerbt das ganze Bild statt
    nur die Maske. Eine Maske IST ein Alphakanal -- so wird sie auch transportiert,
    und der Export (EXR, PNG-Sequenz, WebM-Alpha) braucht spaeter genau das.
    """
    from PIL import Image

    alpha = mask.astype(np.uint8) * 255
    rgba = np.stack([np.full_like(alpha, 255), alpha], axis=-1)  # L + A

    buffer = io.BytesIO()
    Image.fromarray(rgba, mode="LA").save(buffer, format="PNG")
    return buffer.getvalue()


def _session_or_404(session_id: str) -> roto.Session:
    try:
        return roto.get_session(session_id)
    except KeyError:
        raise HTTPException(404, f"Sitzung {session_id} gibt es nicht.") from None


class NewSession(BaseModel):
    variant: str | None = Field(
        default=None,
        description="SAM-2-Variante. Ohne Angabe die interaktive aus ADR 002 (tiny).",
    )


class ClickRequest(BaseModel):
    object_id: str = Field(default="object_1")
    x: float
    y: float
    positive: bool = True


@router.get("/variants")
def variants() -> dict:
    """Welche Checkpoints liegen bereit?"""
    return {
        "available": models.available_variants(),
        "checkpoint_dir": str(models.CHECKPOINT_DIR),
    }


@router.post("/session")
def create(body: NewSession) -> dict:
    try:
        session = roto.create_session(body.variant)
    except FileNotFoundError as err:
        raise HTTPException(503, str(err)) from err
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    return {"session_id": session.id, "variant": session.variant}


@router.delete("/session/{session_id}")
def close(session_id: str) -> dict:
    roto.drop_session(session_id)
    return {"closed": session_id}


@router.get("/session/{session_id}/stats")
def stats(session_id: str) -> dict:
    session = _session_or_404(session_id)
    return {
        "session_id": session.id,
        "variant": session.variant,
        "objects": {oid: {f: len(p) for f, p in o.points.items()} for oid, o in session.objects.items()},
        "cache": session.cache.stats(),
    }


@router.post("/session/{session_id}/frames/{frame}/embed")
async def embed(session_id: str, frame: int, request: Request) -> dict:
    """Frame encodieren und in den Cache legen. Teuer (~280 ms, ADR 002).

    Auch der Prefetch-Pfad: die Nachbarframes hier vorwaermen, damit der erste
    Klick auf ihnen keine Wartezeit hat.
    """
    session = _session_or_404(session_id)
    image = _decode_image(await request.body())
    cached, encode_ms = roto.embed_frame(session, frame, image)
    return {
        "frame": frame,
        "cached": cached,
        "encode_ms": encode_ms,
        "cache": session.cache.stats(),
    }


@router.post("/session/{session_id}/frames/{frame}/click")
def click(session_id: str, frame: int, body: ClickRequest) -> Response:
    """Punkt setzen, Maske zurueck. Billig (~11 ms), solange der Frame im Cache liegt.

    Antwort ist ein PNG; die Zahlen stehen in den Headern, damit das UI sie ohne
    zweite Anfrage anzeigen kann.
    """
    session = _session_or_404(session_id)
    try:
        result = roto.click(
            session,
            frame=frame,
            object_id=body.object_id,
            point=models.Point(x=body.x, y=body.y, positive=body.positive),
        )
    except LookupError as err:
        raise HTTPException(409, str(err)) from err
    except ValueError as err:
        raise HTTPException(422, str(err)) from err

    return Response(
        content=_encode_mask_png(result["mask"]),
        media_type="image/png",
        headers={
            "X-Score": str(result["score"]),
            "X-Predict-Ms": str(result["predict_ms"]),
            "X-Points": str(result["points"]),
            "X-Object-Id": result["object_id"],
            # Ohne diese Zeile sieht der Browser die X-Header nicht (CORS).
            "Access-Control-Expose-Headers": "X-Score, X-Predict-Ms, X-Points, X-Object-Id",
        },
    )
