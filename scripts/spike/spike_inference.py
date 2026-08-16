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


def _vit_encoder(dim: int, layers: int, heads: int):
    """ViT-B-artiger Encoder-Stapel.

    SAM-2s Bild-Encoder (Hiera) ist kein reiner ViT, aber die Kostenstruktur ist
    dieselbe: Self-Attention ueber Patch-Tokens, quadratisch in der Tokenzahl.
    Der Conv-Stack allein misst das nicht -- er ist zu billig und wuerde die
    Karte zu gut aussehen lassen.
    """
    import torch.nn as nn

    return nn.TransformerEncoder(
        nn.TransformerEncoderLayer(
            d_model=dim,
            nhead=heads,
            dim_feedforward=dim * 4,
            activation="gelu",
            batch_first=True,
            norm_first=True,
        ),
        num_layers=layers,
    )


def cmd_synthetic(args: argparse.Namespace) -> int:
    """Rohleistung ohne Modell-Download.

    Zwei Lasten: ein Conv-Stack (billig, misst die Kernel-Pipeline) und ein
    ViT-B-artiger Encoder (teuer, misst das, was bei SAM 2 wirklich Zeit kostet).
    Beides ersetzt keine echte SAM-2-Messung, klammert das Ergebnis aber ein.
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

    # ViT-B-Zuschnitt: 12 Bloecke, 768 Dimensionen, Patch 16.
    vit = _vit_encoder(dim=768, layers=12, heads=12).to(device=device, dtype=dtype).eval()

    results: dict[str, dict[str, dict[str, float]]] = {"conv": {}, "vit-b": {}}

    def report(kind: str, label: str, stats: dict[str, float], extra: str = "") -> None:
        budget = BUDGET_MS.get(label)
        verdict = ""
        if budget:
            verdict = "  im Budget" if stats["median_ms"] <= budget else f"  UEBER Budget ({budget} ms)"
        print(f"{kind:<7} {label:<12} {extra:<14} median {stats['median_ms']:>8.1f} ms"
              f"  (min {stats['min_ms']}, max {stats['max_ms']}){verdict}")

    with torch.inference_mode():
        for label, (width, height) in RESOLUTIONS.items():
            x = torch.randn(1, 3, height, width, device=device, dtype=dtype)

            def run_conv():
                stack(x)
                torch.cuda.synchronize()

            stats = _bench(run_conv)
            results["conv"][label] = stats
            report("conv", label, stats, f"{width}x{height}")

        print()

        for label, (width, height) in RESOLUTIONS.items():
            tokens = (height // 16) * (width // 16)
            seq = torch.randn(1, tokens, 768, device=device, dtype=dtype)

            def run_vit():
                vit(seq)
                torch.cuda.synchronize()

            # Weniger Laeufe: bei hoher Tokenzahl dauert jeder Durchgang deutlich laenger.
            stats = _bench(run_vit, warmup=2, runs=6)
            results["vit-b"][label] = stats
            report("vit-b", label, stats, f"{tokens} Tokens")

    peak_gb = torch.cuda.max_memory_allocated() / 1024**3
    print(f"\nVRAM Spitze: {peak_gb:.2f} GB von 16 GB")
    print("Einordnung: conv misst die Kernel-Pipeline, vit-b die Attention-Last.")
    print("SAM 2 liegt dazwischen — das ist eine Klammer, keine Prognose.")

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


# Hydra-Config je Checkpoint. Die Namen weichen von den Dateinamen ab (b+ vs base_plus).
SAM2_CONFIGS = {
    "sam2.1_hiera_tiny": "configs/sam2.1/sam2.1_hiera_t.yaml",
    "sam2.1_hiera_small": "configs/sam2.1/sam2.1_hiera_s.yaml",
    "sam2.1_hiera_base_plus": "configs/sam2.1/sam2.1_hiera_b+.yaml",
    "sam2.1_hiera_large": "configs/sam2.1/sam2.1_hiera_l.yaml",
}


def cmd_sam2(args: argparse.Namespace) -> int:
    """Echte SAM-2-Latenz, getrennt nach Encoder und Klick-Antwort.

    Wichtig fuer die Auswertung: SAM 2 skaliert jedes Bild intern auf 1024x1024.
    Die Encoder-Zeit haengt deshalb NICHT von der Eingangsaufloesung ab, sondern nur
    von der Modellgroesse. Eine Proxy-Aufloesung spart hier nichts -- sie spart bei
    Decode, Matting und IO. Wer das verwechselt, plant die falsche Optimierung.

    Was tatsaechlich variiert:
      * set_image()  -- einmal pro Frame, teuer, cachebar
      * predict()    -- pro Klick, billig, laeuft auf dem gecachten Embedding

    Fuer UC-E7 zaehlt predict(): das ist die Latenz, die der Nutzer beim Korrigieren spuert.
    """
    try:
        import torch
    except ImportError:
        print("torch fehlt. Erst Pfad A aus scripts/spike/README.md.")
        return 1

    checkpoints = [Path(c) for c in (args.checkpoint or [])]
    missing = [c for c in checkpoints if not c.exists()]
    if not checkpoints or missing:
        print("Checkpoint fehlt: " + (", ".join(str(m) for m in missing) or "keiner angegeben"))
        print("  --checkpoint <pfad.pt> [<pfad.pt> ...]")
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
    width, height = RESOLUTIONS["proxy-960"]
    image = np.random.randint(0, 255, (height, width, 3), dtype=np.uint8)
    point = np.array([[width // 2, height // 2]])
    label_arr = np.array([1])

    print(f"Device: {torch.cuda.get_device_name(0)}")
    print(f"Eingang: {width}x{height} (SAM 2 skaliert intern auf 1024x1024)\n")
    print(f"{'Variante':<24} {'set_image':>12} {'predict':>12} {'Summe':>10}   {'VRAM':>8}")
    print("-" * 72)

    results: dict[str, dict] = {}
    for checkpoint in checkpoints:
        name = checkpoint.stem
        config = args.config or SAM2_CONFIGS.get(name)
        if not config:
            print(f"{name:<24} keine Config bekannt — mit --config angeben")
            continue

        torch.cuda.reset_peak_memory_stats()
        model = build_sam2(config, str(checkpoint), device=device)
        predictor = SAM2ImagePredictor(model)

        def encode():
            predictor.set_image(image)
            torch.cuda.synchronize()

        encode_stats = _bench(encode, warmup=2, runs=6)

        # Embedding liegt jetzt vor -- predict() misst nur noch den Decoder.
        def click():
            predictor.predict(point_coords=point, point_labels=label_arr, multimask_output=True)
            torch.cuda.synchronize()

        click_stats = _bench(click, warmup=3, runs=10)

        vram = torch.cuda.max_memory_allocated() / 1024**3
        total = encode_stats["median_ms"] + click_stats["median_ms"]
        results[name] = {
            "config": config,
            "set_image": encode_stats,
            "predict": click_stats,
            "vram_gb": round(vram, 2),
        }
        print(f"{name:<24} {encode_stats['median_ms']:>9.1f} ms {click_stats['median_ms']:>9.1f} ms "
              f"{total:>7.1f} ms {vram:>7.2f} GB")

        del predictor, model
        torch.cuda.empty_cache()

    budget = BUDGET_MS["proxy-960"]
    print(f"\nBudget fuer die Klick-Korrektur: {budget:.0f} ms (UC-E7).")
    print("Gilt fuer predict() auf gecachtem Embedding — set_image laeuft einmal pro Frame")
    print("und gehoert in den Frame-Cache, nicht in den Klick-Pfad.")

    _write(args, {
        "kind": "sam2",
        "device": torch.cuda.get_device_name(0),
        "input_resolution": f"{width}x{height}",
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
    sub = parser.add_subparsers(dest="command", required=True)

    env = sub.add_parser("env", help="Was ist installiert?")
    env.set_defaults(func=cmd_env, out=None)

    synthetic = sub.add_parser("synthetic", help="Rohleistung ohne Modell-Download")
    synthetic.add_argument("--fp32", action="store_true", help="statt fp16 messen")
    # --out gehoert an die Unterbefehle, nicht nach vorn: `spike synthetic --out x`
    # ist die Reihenfolge, die man tippt.
    synthetic.add_argument("--out", help="Zieldatei fuer das JSON-Ergebnis")
    synthetic.set_defaults(func=cmd_synthetic)

    sam2 = sub.add_parser("sam2", help="Echte SAM-2-Latenz (Encoder und Klick)")
    sam2.add_argument("--checkpoint", nargs="+", help="Eine oder mehrere Checkpoint-Dateien")
    sam2.add_argument("--config", help="Hydra-Config; sonst aus dem Dateinamen abgeleitet")
    sam2.add_argument("--out", help="Zieldatei fuer das JSON-Ergebnis")
    sam2.set_defaults(func=cmd_sam2)

    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
