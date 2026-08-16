# ADR 001 — Inferenz-Backend auf AMD/Windows

**Status:** teilweise gemessen — Pfad B bestätigt, Pfad A steht aus
**Datum:** 2026-08-16 (erste Messung)
**Betrifft:** M1 (Roto Core), Modellauswahl ab M2, UC-E7

## Kontext

Zielhardware ist eine AMD Radeon RX 7600 XT (Navi 33, gfx1102, 16 GB) unter Windows 11.
Kein CUDA, kein TensorRT. Damit fallen sämtliche veröffentlichten SAM-Benchmarks als
Planungsgrundlage weg — sie stammen von NVIDIA-Hardware.

Drei Pfade stehen zur Wahl (Details und Installationsbefehle: `scripts/spike/README.md`):

- **A — PyTorch + ROCm, Windows-nativ.** AMD liefert `cp312`-Wheels für ROCm 7.2.1,
  gfx110X ist abgedeckt. Bequemster Weg, größte Modellabdeckung.
- **B — ONNX Runtime + DirectML.** Vendor-neutral über DX12, einfacher auszuliefern,
  aber jedes Modell braucht einen funktionierenden ONNX-Export.
- **C — WSL2/Linux.** Ausgereifter, aber ein Tool, das einen Dual-Boot verlangt, benutzt man nicht.

## Messung

Ausgeführt mit `python scripts/spike/spike_inference.py …`.
**Diese Tabelle ist auszufüllen, bevor M1 geplant wird.**

| Pfad | Installation lief durch | GPU-Provider sichtbar | synthetic proxy-960 | synthetic full-1920 | SAM 2 Encoder proxy-960 | VRAM Spitze |
|---|---|---|---|---|---|---|
| A — ROCm nativ | ☐ offen | ☐ | — ms | — ms | — ms | — GB |
| B — ONNX/DirectML | ☑ ja | ☑ `DmlExecutionProvider` | — ms | — ms | — ms | — GB |
| C — WSL2 | ☐ nicht nötig, solange A oder B trägt | ☐ | — ms | — ms | — ms | — GB |

Umgebung zum Zeitpunkt der Messung:

| | |
|---|---|
| GPU | AMD Radeon RX 7600 XT, Treiber 32.0.31019.2002 (WDDM) — **Adrenalin-Version noch prüfen, ROCm 7.2.1 verlangt 26.2.2+** |
| OS | Windows 11 (AMD64) |
| Python | 3.12.13 (uv-verwaltet; System-Python 3.14 wird nicht benutzt) |
| onnxruntime | 1.24.4 (`onnxruntime-directml`), Provider: `DmlExecutionProvider`, `CPUExecutionProvider` |
| torch / ROCm | nicht installiert |

**Was am 2026-08-16 tatsächlich belegt ist:** Pfad B installiert sauber in die 3.12-Umgebung und
meldet den DirectML-Provider — der DX12-Weg auf dieser Karte steht also grundsätzlich offen.
**Was noch nicht belegt ist:** dass darüber auch echte Kernel in brauchbarer Zeit laufen. Dafür
fehlt ein Modell; die Provider-Meldung allein ist kein Leistungsnachweis.

## Entscheidung

*(nach dem Spike ausfüllen)*

Primärpfad: —
Zweitpfad: —
Begründung: —

## Konsequenzen

*(nach dem Spike ausfüllen — mindestens diese vier Fragen beantworten)*

1. Bleibt die Klick-Korrektur auf Proxy unter 250 ms? Wenn nein: welches leichtere Modell
   (EfficientTAM statt SAM 2) oder welche kleinere Proxy-Auflösung?
2. Ist SAM 3 als Hintergrund-Pass realistisch, oder wird UC-A11 auf später vertagt?
3. Sind MatAnyone 2 und CoTracker3 auf dem gewählten Pfad überhaupt lauffähig
   (bei B: existiert ein ONNX-Export)?
4. Bleibt UC-A7 (Object Removal) im Scope, oder fällt es raus? DiffuEraser ist auf dieser
   Karte Nacht-Batch-Territorium.
