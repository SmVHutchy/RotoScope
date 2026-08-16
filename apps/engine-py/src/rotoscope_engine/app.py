"""FastAPI-App der Engine.

M0: /health und /device. Mehr nicht -- die Roto-Endpunkte entstehen in M1, sobald
der Spike entschieden hat, welches Backend traegt.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .backends import probe

app = FastAPI(
    title="RotoScope Engine",
    version=__version__,
    summary="Lokaler Inferenz-Dienst. Laeuft offline, ohne Telemetrie.",
)

# Der Vite-Dev-Server proxyt /api, aber die Web-App darf die Engine auch direkt
# ansprechen. Localhost only -- die Engine geht nie ans Netz (PROJECT_PROMPT.md UC-E1).
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "rotoscope-engine", "version": __version__}


@app.get("/device")
def device() -> dict:
    """Was kann diese Maschine rechnen? Grundlage fuer den M0-Spike."""
    return probe()
