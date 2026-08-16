"""Startpunkt: `uv run --project apps/engine-py engine`."""

from __future__ import annotations

import argparse
import os

import uvicorn

from . import DEFAULT_HOST, DEFAULT_PORT, __version__


def _apply_rocm_tuning() -> None:
    """AOTriton-Attention aktivieren (ADR 001).

    PyTorch schaltet Flash- und Memory-Efficient-Attention auf AMD standardmaessig ab
    ("still experimental"). Gemessen am 2026-08-16: -30 % Latenz, -80 % VRAM. Zu viel,
    um es liegen zu lassen -- aber abschaltbar, solange die Korrektheitspruefung der
    Maskenausgabe (M1) aussteht.

        ROTOSCOPE_AOTRITON=0 uv run engine    # ohne die experimentellen Kernel

    Muss vor dem ersten torch-Import gesetzt sein, deshalb steht es hier und nicht
    in backends.py.
    """
    if os.environ.get("ROTOSCOPE_AOTRITON", "1") != "0":
        os.environ.setdefault("TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL", "1")


def main() -> None:
    _apply_rocm_tuning()

    parser = argparse.ArgumentParser(prog="engine", description="RotoScope Engine")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--reload", action="store_true", help="Auto-Reload waehrend der Entwicklung")
    parser.add_argument("--version", action="version", version=__version__)
    args = parser.parse_args()

    uvicorn.run(
        "rotoscope_engine.app:app",
        host=args.host,
        port=args.port,
        reload=args.reload,
        log_level="info",
    )


if __name__ == "__main__":
    main()
