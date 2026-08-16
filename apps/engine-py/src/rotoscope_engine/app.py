"""FastAPI-App der Engine.

M0: /health und /device. Mehr nicht -- die Roto-Endpunkte entstehen in M1, sobald
der Spike entschieden hat, welches Backend traegt.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

import io
from pathlib import Path

import numpy as np
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .api_roto import router as roto_router
from .backends import probe

log = logging.getLogger("rotoscope")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Backends beim Start einmal anfassen.

    Der erste Import von onnxruntime oder torch dauert mehrere Sekunden -- laesst man
    das bis zur ersten /device-Anfrage liegen, laeuft jeder Client in einen Timeout.
    Lieber der Start dauert eine Sekunde laenger.
    """
    info = probe()
    log.info("Backends: %s", info["preferred"] or "keines")
    yield


app = FastAPI(
    title="RotoScope Engine",
    version=__version__,
    summary="Lokaler Inferenz-Dienst. Laeuft offline, ohne Telemetrie.",
    lifespan=lifespan,
)

# Der Vite-Dev-Server proxyt /api, aber die Web-App darf die Engine auch direkt
# ansprechen. Localhost only -- die Engine geht nie ans Netz (PROJECT_PROMPT.md UC-E1).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(roto_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rotoscope-engine", "version": __version__}


# Repo-Wurzel: .../apps/engine-py/src/rotoscope_engine/app.py
CHECKPOINTS = Path(__file__).resolve().parents[4] / "checkpoints"
DEPTH_MODEL = CHECKPOINTS / "depth-anything-v2-small.onnx"


@app.post("/depth")
async def depth(request: Request) -> Response:
    """Tiefenkarte zu einem Bild. Roher Bildkoerper rein, Graustufen-PNG raus.

    Nur die Small-Variante, Apache-2.0 (docs/licenses/depth-anything-v2.md).
    Gemessen auf einer RX 7600 XT ueber DirectML: rund 84 ms bei 1280x720.
    """
    from PIL import Image

    from .depth import get_estimator

    data = await request.body()
    if not data:
        raise HTTPException(400, "Leerer Bildkoerper.")

    try:
        estimator = get_estimator(DEPTH_MODEL)
    except FileNotFoundError as err:
        raise HTTPException(503, str(err)) from err

    try:
        image = np.asarray(Image.open(io.BytesIO(data)).convert("RGB"))
    except Exception as err:  # noqa: BLE001
        raise HTTPException(400, f"Bild nicht lesbar: {err}") from err

    depth_map, elapsed = estimator.estimate(image)

    buffer = io.BytesIO()
    Image.fromarray(depth_map, mode="L").save(buffer, format="PNG")
    return Response(
        content=buffer.getvalue(),
        media_type="image/png",
        headers={
            "X-Depth-Ms": str(elapsed),
            "X-Provider": estimator.provider,
            "Access-Control-Expose-Headers": "X-Depth-Ms, X-Provider",
        },
    )


@app.get("/device")
def device() -> dict:
    """Was kann diese Maschine rechnen? Grundlage fuer den M0-Spike."""
    return probe()
