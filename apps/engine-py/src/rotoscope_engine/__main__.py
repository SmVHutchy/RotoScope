"""Startpunkt: `uv run --project apps/engine-py engine`."""

from __future__ import annotations

import argparse

import uvicorn

from . import DEFAULT_HOST, DEFAULT_PORT, __version__


def main() -> None:
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
