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

    import torch  # noqa: PLC0415  (bewusst lazy)

    version = getattr(torch, "__version__", "?")
    hip = getattr(torch.version, "hip", None)
    cuda_build = getattr(torch.version, "cuda", None)

    out: list[BackendInfo] = []
    devices = []
    if torch.cuda.is_available():
        devices = [torch.cuda.get_device_name(i) for i in range(torch.cuda.device_count())]

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
    return [
        BackendInfo(
            "onnx-directml",
            "DmlExecutionProvider" in providers,
            f"onnxruntime {ort.__version__}, Provider: {', '.join(providers)}",
        )
    ]


def probe() -> dict[str, Any]:
    """Vollstaendiger Umgebungsbericht. Wird von /device und vom Spike genutzt."""
    backends = [*_probe_torch(), *_probe_onnxruntime()]
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
            "Zielhardware ist eine AMD RX 7600 XT (gfx1102) unter Windows. "
            "Kein CUDA, kein TensorRT — siehe PROJECT_PROMPT.md §4.5."
        ),
    }
