# RotoScope Engine

Lokaler Inferenz-Dienst. Läuft offline, ohne Telemetrie (UC-E1).

```bash
npm run engine:mac    # macOS: ONNX Runtime mit CoreML
npm run engine:win    # Windows: PyTorch/ROCm und ONNX/DirectML
```

Ohne Neuinstallation der Abhängigkeiten:

```bash
uv run --project apps/engine-py engine          # startet auf 127.0.0.1:8787
uv run --project apps/engine-py engine --reload # mit Auto-Reload
```

| Endpunkt | Zweck |
|---|---|
| `GET /health` | Lebt der Dienst? |
| `GET /device` | Welche Inferenz-Backends sind verfügbar, welches wird bevorzugt? |

## Python 3.12 ist gepinnt

Nicht aus Vorsicht, sondern weil die ROCm-Wheels von AMD `cp312` sind. uv holt die passende
Version selbst — das System-Python (3.14) bleibt unangetastet.

## Zwei Umgebungen, vorerst

`apps/engine-py/.venv` (FastAPI + ONNX/DirectML) und `.venv-rocm` (torch/ROCm) existieren
nebeneinander — für den M0-Spike war das die saubere Trennung, für M1 ist es eine Altlast.
Zusammenführen, bevor Modellcode entsteht (ADR 001, Konsequenz 7).

## AOTriton-Attention ist standardmäßig an

Die Engine setzt `TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1` (ADR 001: −30 % Latenz, −80 % VRAM).
Abschalten für den Korrektheitsvergleich:

```bash
ROTOSCOPE_AOTRITON=0 uv run --project apps/engine-py engine
```

## Torch ist absichtlich keine Abhängigkeit

Welcher Inferenz-Stack installiert wird, entscheidet der M0-Spike
([scripts/spike/README.md](../../scripts/spike/README.md)); die Wheels sind mehrere GB groß und
pfadabhängig. Die Engine startet deshalb auch ohne Torch und meldet über `/device` ehrlich,
dass kein GPU-Backend da ist. Das Modell-Interface entsteht in M1.
