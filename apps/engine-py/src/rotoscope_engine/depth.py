"""Tiefenkarten ueber Depth Anything V2 Small.

Laeuft ueber **ONNX Runtime mit DirectML** -- Pfad B aus ADR 001. Damit braucht die
Tiefe kein Torch: ein Modell, das ohne den schweren Stack auskommt, ist auf dieser
Hardware die guenstigere Wahl und laeuft zudem auf jeder DX12-Karte.

Lizenz: **nur die Small-Variante** (Apache-2.0). Base und Large stehen unter
CC-BY-NC-4.0 und sind gesperrt -- siehe docs/licenses/depth-anything-v2.md.
"""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path

import numpy as np

log = logging.getLogger("rotoscope.depth")

# Das Netz erwartet ein Vielfaches von 14 (Patchgroesse des Vision Transformers).
INPUT_SIZE = 518
MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


class DepthEstimator:
    """Haelt die ONNX-Sitzung. Laden kostet Sekunden, Rechnen danach nicht mehr."""

    def __init__(self, model_path: Path):
        import onnxruntime as ort

        if not model_path.exists():
            raise FileNotFoundError(f"Tiefenmodell fehlt: {model_path}")

        # Reihenfolge ist die Vorliebe: DirectML auf Windows, CoreML auf dem Mac,
        # CPU als letzte Zuflucht. Der Code bleibt derselbe -- nur der Beschleuniger
        # wechselt mit der Plattform.
        bevorzugt = ("DmlExecutionProvider", "CoreMLExecutionProvider", "CPUExecutionProvider")
        verfuegbar = ort.get_available_providers()
        providers = [p for p in bevorzugt if p in verfuegbar]
        started = time.perf_counter()
        self.session = ort.InferenceSession(str(model_path), providers=providers)
        self.provider = self.session.get_providers()[0]
        self.input_name = self.session.get_inputs()[0].name
        self._lock = threading.Lock()

        log.info(
            "Tiefenmodell geladen in %.0f ms ueber %s",
            (time.perf_counter() - started) * 1000,
            self.provider,
        )

    def _preprocess(self, image: np.ndarray) -> np.ndarray:
        from PIL import Image

        resized = np.asarray(
            Image.fromarray(image).resize((INPUT_SIZE, INPUT_SIZE), Image.Resampling.BILINEAR),
            dtype=np.float32,
        ) / 255.0
        normalized = (resized - MEAN) / STD
        return normalized.transpose(2, 0, 1)[None].astype(np.float32)

    def estimate(self, image: np.ndarray) -> tuple[np.ndarray, float]:
        """Relative Tiefe als Graustufenbild, 0 bis 255, in Originalgroesse.

        Absolute Entfernungen liefert das Modell nicht — fuer eine Parallaxe braucht
        es die auch nicht: dort zaehlt nur, was vorn und was hinten ist.
        """
        from PIL import Image

        height, width = image.shape[:2]
        tensor = self._preprocess(image)

        with self._lock:
            started = time.perf_counter()
            output = self.session.run(None, {self.input_name: tensor})[0]
            elapsed = (time.perf_counter() - started) * 1000

        depth = np.squeeze(np.asarray(output))
        span = float(depth.max() - depth.min())
        normalized = (depth - depth.min()) / span if span > 1e-6 else np.zeros_like(depth)

        full = Image.fromarray((normalized * 255).astype(np.uint8)).resize(
            (width, height), Image.Resampling.BILINEAR
        )
        return np.asarray(full), round(elapsed, 1)


_estimator: DepthEstimator | None = None
_load_lock = threading.Lock()


def get_estimator(model_path: Path) -> DepthEstimator:
    global _estimator
    with _load_lock:
        if _estimator is None:
            _estimator = DepthEstimator(model_path)
    return _estimator
