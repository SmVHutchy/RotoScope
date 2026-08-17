"""Backend-Erkennung.

Das Interface aus PROJECT_PROMPT.md §4.5 entsteht in M1. Was hier steht, ist die
Vorstufe davon: die Engine muss *melden* koennen, worauf sie laeuft, bevor sie
irgendetwas rechnet. Der M0-Spike stuetzt sich auf genau diese Ausgabe.

Wichtig: nichts hier importiert torch oder onnxruntime hart. Die Engine startet
auch dann, wenn noch kein Inferenz-Stack installiert ist -- das ist in M0 der
Normalzustand.
"""

from __future__ import annotations

import importlib.util
import platform
from dataclasses import dataclass, field, asdict
from typing import Any


def _installed(module: str) -> bool:
    try:
        return importlib.util.find_spec(module) is not None
    except (ImportError, ValueError):
        return False


@dataclass
class BackendInfo:
    """Ein moeglicher Rechenpfad und sein Zustand auf dieser Maschine."""

    name: str
    available: bool
    detail: str
    devices: list[str] = field(default_factory=list)


def _probe_torch() -> list[BackendInfo]:
    if not _installed("torch"):
        return [
            BackendInfo(
                "torch",
                False,
                "torch nicht installiert — erwartet in M0 (siehe scripts/spike/README.md)",
            )
        ]

    import torch  # noqa: PLC0415  (bewusst lazy)  # type: ignore[import-not-found]

    version = getattr(torch, "__version__", "?")
    hip = getattr(torch.version, "hip", None)
    cuda_build = getattr(torch.version, "cuda", None)

    out: list[BackendInfo] = []
    devices = []
    if torch.cuda.is_available():
        devices = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]

    # Apple Silicon meldet sich nicht ueber die CUDA-API, sondern als eigenes Backend.
    mps = getattr(getattr(torch, "backends", None), "mps", None)
    if mps is not None and mps.is_available():
        out.append(BackendInfo("torch-mps", True, f"torch {version} auf Apple Silicon", ["mps"]))

    # Auf ROCm-Builds meldet sich AMD-Hardware ueber die CUDA-API. Der Unterschied
    # steckt in torch.version.hip -- nicht im Device-Namen.
    if hip:
        out.append(
            BackendInfo(
                "torch-rocm",
                bool(devices),
                f"torch {version} (ROCm/HIP {hip})",
                devices,
            )
        )
    elif cuda_build:
        out.append(
            BackendInfo(
                "torch-cuda",
                bool(devices),
                f"torch {version} (CUDA {cuda_build}) — nicht die Zielplattform",
                devices,
            )
        )
    else:
        out.append(BackendInfo("torch-cpu", True, f"torch {version} ohne GPU-Build", []))
    return out


def _probe_onnxruntime() -> list[BackendInfo]:
    if not _installed("onnxruntime"):
        return [BackendInfo("onnx-directml", False, "onnxruntime nicht installiert")]

    import onnxruntime as ort  # noqa: PLC0415

    providers = ort.get_available_providers()
    beschleunigt = [p for p in ("DmlExecutionProvider", "CoreMLExecutionProvider") if p in providers]
    return [
        BackendInfo(
            "onnx-" + (beschleunigt[0].replace("ExecutionProvider", "").lower() if beschleunigt else "cpu"),
            bool(beschleunigt),
            f"onnxruntime {ort.__version__}, Provider: {', '.join(providers)}",
        )
    ]


def _safe(probe_fn, label: str) -> list[BackendInfo]:
    """Ein kaputtes Backend darf den Bericht nicht mitreissen.

    Halb installierte Stacks sind hier der Normalfall, nicht die Ausnahme: onnxruntime
    wirft z. B. ImportError, wenn numpy erst nach dem Prozessstart dazukam. Das ist
    eine Information ueber die Umgebung -- und gehoert in die Antwort, nicht in einen 500er.
    """
    try:
        return probe_fn()
    except Exception as err:  # noqa: BLE001 -- genau das ist hier gewollt
        return [BackendInfo(label, False, f"Probe fehlgeschlagen: {type(err).__name__}: {err}")]


def probe() -> dict[str, Any]:
    """Vollstaendiger Umgebungsbericht. Wird von /device und vom Spike genutzt."""
    backends = [
        *_safe(_probe_torch, "torch"),
        *_safe(_probe_onnxruntime, "onnx-directml"),
    ]
    preferred = next((b.name for b in backends if b.available and b.name != "torch-cpu"), None)

    return {
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "machine": platform.machine(),
            "python": platform.python_version(),
        },
        "backends": [asdict(b) for b in backends],
        "preferred": preferred,
        "note": (
            "Entwickelt auf einer AMD RX 7600 XT (gfx1102) unter Windows: kein CUDA, "
            "kein TensorRT (PROJECT_PROMPT.md §4.5). Auf macOS uebernehmen CoreML "
            "und MPS dieselbe Rolle — der Code bleibt gleich."
        ),
    }
