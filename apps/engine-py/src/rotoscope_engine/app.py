"""FastAPI-App der Engine.

M0: /health und /device. Mehr nicht -- die Roto-Endpunkte entstehen in M1, sobald
der Spike entschieden hat, welches Backend traegt.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
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


@app.get("/device")
def device() -> dict:
    """Was kann diese Maschine rechnen? Grundlage fuer den M0-Spike."""
    return probe()
