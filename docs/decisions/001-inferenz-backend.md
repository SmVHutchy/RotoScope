# ADR 001 — Inferenz-Backend auf AMD/Windows

**Status:** **entschieden** — Pfad A (ROCm) primär, Pfad B (DirectML) sekundär
**Datum:** 2026-08-16
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

| Pfad | Installation | GPU sichtbar | Messung |
|---|---|---|---|
| **A — ROCm nativ** | ☑ `torch 2.9.1+rocm7.2.1`, HIP `7.2.53211` | ☑ `AMD Radeon RX 7600 XT` | ☑ vollständig, siehe unten |
| B — ONNX/DirectML | ☑ `onnxruntime-directml 1.24.4` | ☑ `DmlExecutionProvider` | ☐ Provider bestätigt, keine Kernel-Messung (braucht ONNX-Modell) |
| C — WSL2 | ☐ nicht nötig — A trägt | — | — |

### Gemessen: synthetische Lasten, fp16, Median aus 6–12 Läufen

`python scripts/spike/spike_inference.py synthetic`

| Last | Auflösung | Standard | mit `TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1` |
|---|---|---|---|
| Conv-Stack | proxy-960 (960×544) | 2,2 ms | 2,1 ms |
| Conv-Stack | full-1920 (1920×1088) | 7,4 ms | 7,6 ms |
| **ViT-B-Encoder** | **proxy-960 (2040 Tokens)** | **79,9 ms** | **56,2 ms** |
| **ViT-B-Encoder** | full-1920 (8160 Tokens) | 705,6 ms | 460,8 ms |
| VRAM Spitze | — | 1,84 GB | **0,36 GB** |

Umgebung:

| | |
|---|---|
| GPU | AMD Radeon RX 7600 XT, Adrenalin `26.10.19.02` (Treiberdatum 2026-05-29) — Anforderung ROCm 7.2.1 (≥ 26.2.2) erfüllt |
| OS | Windows 11 (AMD64) |
| Python | 3.12.13, uv-verwaltet — System-Python 3.14 bleibt unangetastet |
| torch | 2.9.1+rocm7.2.1, HIP 7.2.53211-158bd99533 |
| onnxruntime | 1.24.4 (DirectML) |

**Der ViT-B-Wert ist die relevante Zahl**, nicht der Conv-Stack: SAM 2s Bild-Encoder (Hiera) hat
dieselbe Kostenstruktur — Self-Attention über Patch-Tokens, quadratisch in der Tokenzahl. Der
Conv-Stack misst nur, ob die Kernel-Pipeline gesund ist (sie ist es).

## Entscheidung

**Primärpfad: A — PyTorch + ROCm, Windows-nativ.** Läuft, ist schnell genug, und deckt alle
Modelle ab, ohne einen ONNX-Export zu erzwingen.

**Zweitpfad: B — ONNX Runtime + DirectML.** Bleibt gepflegt, weil er ohne ROCm-Installation
auskommt und damit der Weg ist, das Tool je an andere Rechner auszuliefern.

**Pfad C entfällt**, solange A trägt. Kein Dual-Boot.

**`TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1` wird gesetzt** — die Engine setzt die Variable
selbst, mit Abschaltmöglichkeit. Begründung: −30 % Latenz und −80 % VRAM sind zu viel, um sie
liegen zu lassen. Risiko: PyTorch nennt die Attention-Kernel auf AMD ausdrücklich experimentell,
also braucht M1 einen Korrektheitsvergleich der Maskenausgabe mit und ohne die Variable, bevor
sie als Default festgeschrieben wird.

## Konsequenzen

1. **Der Proxy-Pfad trägt.** 56–80 ms für eine ViT-B-Encoder-Last bei 960 px lassen im
   250-ms-Budget für die Klick-Korrektur genug Luft für Decoder, Maskenaufbereitung und
   Netzwerk-Overhead. Die zweistufige Architektur aus §4.5 wird nicht nur gebaut, weil sie
   sauber ist, sondern weil die Zahlen sie tragen.
2. **Volle Auflösung bleibt Hintergrundarbeit.** 460–705 ms/Frame ist definitiv kein
   interaktives Budget. Genau so war es geplant — jetzt ist es belegt statt vermutet.
3. **VRAM ist kein Thema.** 0,36–1,84 GB von 16 GB. Modelle können gleichzeitig geladen
   bleiben; das Risiko „sequenziell laden/entladen" aus §11 ist für diese Karte gegenstandslos.
4. **SAM 3 als Hintergrund-Pass bleibt realistisch.** Ein Einmal-Lauf pro Shot im
   Sekundenbereich ist bei diesen Zahlen plausibel. Bestätigen muss das erst die
   `sam2`/`sam3`-Stufe des Spikes mit echten Gewichten.
5. **Offen und in M1 zu klären:** echte SAM-2-Encoder-Messung mit Checkpoint (die synthetische
   Klammer ersetzt sie nicht), ONNX-Exportierbarkeit von MatAnyone 2 und CoTracker3 für Pfad B,
   und die Korrektheitsprüfung der experimentellen Attention-Kernel.
6. **UC-A7 (Object Removal) bleibt vorerst im Scope**, aber DiffuEraser ist bei diesen Werten
   klar Nacht-Batch. Entscheidung vertagt bis M3.
7. **Schuld aus M0:** es existieren zwei Python-Umgebungen — `apps/engine-py/.venv` (FastAPI +
   DirectML) und `.venv-rocm` (torch/ROCm). Für den Spike war die Trennung richtig, für M1 ist
   sie es nicht: die Engine muss in der Umgebung laufen, die auch das gewählte Backend hat.
   Erste Aufgabe in M1, bevor Modellcode entsteht.

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
