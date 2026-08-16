"""M0-Hardware-Spike: traegt diese Karte den Plan?

Laeuft bewusst ohne jede Abhaengigkeit ausser dem, was gerade gemessen werden soll.
`env` funktioniert immer, auch wenn noch gar nichts installiert ist.

    python scripts/spike/spike_inference.py env
    python scripts/spike/spike_inference.py synthetic
    python scripts/spike/spike_inference.py sam2 --checkpoint <pfad>

Anleitung und Installationsbefehle: scripts/spike/README.md
"""

from __future__ import annotations

import argparse
import json
import platform
import statistics
import sys
import time
from pathlib import Path

# Arbeitsaufloesung fuer alles Interaktive (PROJECT_PROMPT.md §4.5), plus
# Vollaufloesung als Gegenprobe.
RESOLUTIONS = {"proxy-960": (960, 544), "full-1920": (1920, 1088)}
WARMUP = 3
RUNS = 12

# Budgets aus §4.5. Nicht als Bestehen/Durchfallen zu lesen, sondern als Korridor:
# der Spike sagt, wo man landet, nicht ob das Projekt scheitert.
BUDGET_MS = {"proxy-960": 250.0}


def _print_kv(pairs: dict[str, object], indent: int = 0) -> None:
    pad = " " * indent
    width = max((len(k) for k in pairs), default=0)
    for key, value in pairs.items():
        print(f"{pad}{key.ljust(width)}  {value}")


def cmd_env(_args: argparse.Namespace) -> int:
    """Was ist installiert, was fehlt."""
    print("== Umgebung ==")
    _print_kv(
        {
            "system": f"{platform.system()} {platform.release()} ({platform.machine()})",
            "python": f"{platform.python_version()} @ {sys.executable}",
        }
    )

    print("\n== Backends ==")
    found = False

    try:
        import torch

        hip = getattr(torch.version, "hip", None)
        cuda = getattr(torch.version, "cuda", None)
        available = torch.cuda.is_available()
        _print_kv(
            {
                "torch": torch.__version__,
                "build": f"ROCm/HIP {hip}" if hip else (f"CUDA {cuda}" if cuda else "CPU-only"),
                "gpu sichtbar": available,
                "device": torch.cuda.get_device_name(0) if available else "-",
            },
            indent=2,
        )
        found = found or available
        if hip and not available:
            print("  Hinweis: ROCm-Build vorhanden, aber keine GPU sichtbar.")
            print("           Meist zu alter Adrenalin-Treiber (26.2.2+ noetig) — siehe README.")
    except ImportError:
        print("  torch            nicht installiert (Pfad A im README)")

    try:
        import onnxruntime as ort

        providers = ort.get_available_providers()
        _print_kv(
            {
                "onnxruntime": ort.__version__,
                "provider": ", ".join(providers),
                "DirectML": "DmlExecutionProvider" in providers,
            },
            indent=2,
        )
        found = found or "DmlExecutionProvider" in providers
    except ImportError:
        print("  onnxruntime      nicht installiert (Pfad B im README)")

    if not found:
        print("\nKein GPU-Backend verfuegbar. In M0 ist das der Ausgangszustand,")
        print("nicht ein Fehler. Naechster Schritt: scripts/spike/README.md, Pfad A.")
        return 1
    return 0


def _bench(fn, warmup: int = WARMUP, runs: int = RUNS) -> dict[str, float]:
    """Median statt Mittelwert: einzelne Ausreisser sollen das Bild nicht kippen."""
    for _ in range(warmup):
        fn()
    samples = []
    for _ in range(runs):
        start = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - start) * 1000)
    return {
        "median_ms": round(statistics.median(samples), 1),
        "min_ms": round(min(samples), 1),
        "max_ms": round(max(samples), 1),
    }


def cmd_synthetic(args: argparse.Namespace) -> int:
    """Rohleistung ohne Modell-Download.

    Ein Stapel Conv2d + Attention-artige Matmuls, grob im Zuschnitt eines
    Vision-Encoders. Das ersetzt keine SAM-2-Messung -- es sagt frueh, ob die
    Karte ueberhaupt in der richtigen Groessenordnung spielt.
    """
    try:
        import torch
        import torch.nn as nn
    except ImportError:
        print("torch fehlt. Erst Pfad A oder B aus scripts/spike/README.md.")
        return 1

    if not torch.cuda.is_available():
        print("Keine GPU sichtbar — Messung auf CPU waere ohne Aussage. Abbruch.")
        return 1

    device = torch.device("cuda")
    dtype = torch.float16 if not args.fp32 else torch.float32
    print(f"Device: {torch.cuda.get_device_name(0)}   dtype: {dtype}")
    print(f"Warmup {WARMUP}, Messungen {RUNS}\n")

    stack = nn.Sequential(
        nn.Conv2d(3, 64, 7, stride=2, padding=3),
        nn.GELU(),
        nn.Conv2d(64, 128, 3, stride=2, padding=1),
        nn.GELU(),
        nn.Conv2d(128, 256, 3, stride=2, padding=1),
        nn.GELU(),
        nn.Conv2d(256, 256, 3, padding=1),
    ).to(device=device, dtype=dtype).eval()

    results: dict[str, dict[str, float]] = {}
    with torch.inference_mode():
        for label, (width, height) in RESOLUTIONS.items():
            x = torch.randn(1, 3, height, width, device=device, dtype=dtype)

            def run():
                stack(x)
                torch.cuda.synchronize()

            stats = _bench(run)
            results[label] = stats

            budget = BUDGET_MS.get(label)
            verdict = ""
            if budget:
                verdict = "  im Budget" if stats["median_ms"] <= budget else f"  ueber Budget ({budget} ms)"
            print(f"{label:<12} {width}x{height:<6} median {stats['median_ms']:>7.1f} ms"
                  f"  (min {stats['min_ms']}, max {stats['max_ms']}){verdict}")

    peak_gb = torch.cuda.max_memory_allocated() / 1024**3
    print(f"\nVRAM Spitze: {peak_gb:.2f} GB")
    print("Achtung: synthetischer Stack, kein SAM 2. Groessenordnung, keine Prognose.")

    _write(args, {
        "kind": "synthetic",
        "device": torch.cuda.get_device_name(0),
        "torch": torch.__version__,
        "hip": getattr(torch.version, "hip", None),
        "dtype": str(dtype),
        "results": results,
        "vram_peak_gb": round(peak_gb, 2),
    })
    return 0


def cmd_sam2(args: argparse.Namespace) -> int:
    """Echte SAM-2-Bild-Encoder-Latenz. Braucht Checkpoint und installiertes sam2."""
    try:
        import torch
    except ImportError:
        print("torch fehlt. Erst Pfad A aus scripts/spike/README.md.")
        return 1

    checkpoint = Path(args.checkpoint) if args.checkpoint else None
    if not checkpoint or not checkpoint.exists():
        print("Kein Checkpoint angegeben oder Datei fehlt.")
        print("  --checkpoint <pfad zur .pt-Datei>")
        print("\nVor dem Herunterladen: docs/licenses/ pruefen. Kein Modell ohne")
        print("dokumentierte Lizenz — das ist Regel 4 im Master-Prompt.")
        return 2

    try:
        from sam2.build_sam import build_sam2  # type: ignore[import-not-found]
        from sam2.sam2_image_predictor import SAM2ImagePredictor  # type: ignore[import-not-found]
    except ImportError:
        print("sam2 ist nicht installiert. Repo: https://github.com/facebookresearch/sam2")
        print("Achtung: NICHT Sammie-Roto-2 klonen (GPL-3.0) — nur das Modell selbst.")
        return 2

    if not torch.cuda.is_available():
        print("Keine GPU sichtbar. Abbruch.")
        return 1

    import numpy as np

    device = torch.device("cuda")
    model = build_sam2(args.config, str(checkpoint), device=device)
    predictor = SAM2ImagePredictor(model)

    results: dict[str, dict[str, float]] = {}
    for label, (width, height) in RESOLUTIONS.items():
        image = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)

        def encode():
            predictor.set_image(image)
            torch.cuda.synchronize()

        stats = _bench(encode, warmup=2, runs=6)
        results[label] = stats

        budget = BUDGET_MS.get(label)
        verdict = ""
        if budget:
            verdict = "  im Budget" if stats["median_ms"] <= budget else f"  ueber Budget ({budget} ms)"
        print(f"{label:<12} encoder median {stats['median_ms']:>8.1f} ms{verdict}")

    _write(args, {
        "kind": "sam2",
        "device": torch.cuda.get_device_name(0),
        "checkpoint": str(checkpoint),
        "results": results,
    })
    return 0


def _write(args: argparse.Namespace, payload: dict) -> None:
    out = Path(args.out) if args.out else Path(__file__).parent / f"results-{payload['kind']}.json"
    payload["timestamp"] = time.strftime("%Y-%m-%d %H:%M:%S")
    out.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"\ngeschrieben: {out}")
    print("Zahlen nach docs/decisions/001-inferenz-backend.md uebertragen.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", help="Zieldatei fuer das JSON-Ergebnis")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("env", help="Was ist installiert?").set_defaults(func=cmd_env)

    synthetic = sub.add_parser("synthetic", help="Rohleistung ohne Modell-Download")
    synthetic.add_argument("--fp32", action="store_true", help="statt fp16 messen")
    synthetic.set_defaults(func=cmd_synthetic)

    sam2 = sub.add_parser("sam2", help="Echte SAM-2-Encoder-Latenz")
    sam2.add_argument("--checkpoint", help="Pfad zur Checkpoint-Datei")
    sam2.add_argument("--config", default="configs/sam2.1/sam2.1_hiera_s.yaml")
    sam2.set_defaults(func=cmd_sam2)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
