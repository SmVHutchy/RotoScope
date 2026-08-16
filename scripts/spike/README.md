# M0 — Hardware-Spike: Welches Inferenz-Backend trägt auf dieser Karte?

**Zielhardware:** AMD Radeon RX 7600 XT — Navi 33, **gfx1102**, 16 GB, Windows 11.
Kein CUDA, kein TensorRT. Siehe [PROJECT_PROMPT.md §4.5](../../PROJECT_PROMPT.md).

Das Ergebnis dieses Spikes entscheidet den Zuschnitt von M1. Ohne gemessene Zahlen wird
M1 nicht geplant — das ist die Abnahmebedingung von M0.

---

## Ablauf

```bash
# 1. Was ist überhaupt da?
python scripts/spike/spike_inference.py env

# 2. Rohe GPU-Leistung messen (kein Modell-Download nötig)
python scripts/spike/spike_inference.py synthetic

# 3. Echtes SAM-2-Encoder-Budget messen (braucht Checkpoint, siehe unten)
python scripts/spike/spike_inference.py sam2 --checkpoint <pfad>
```

Ergebnisse nach [`docs/decisions/001-inferenz-backend.md`](../../docs/decisions/001-inferenz-backend.md)
eintragen. Der Spike schreibt zusätzlich `scripts/spike/results-<backend>.json`.

---

## Pfad A — PyTorch + ROCm, Windows-nativ (Primärpfad)

Stand August 2026 liefert AMD fertige Windows-Wheels. **Python 3.12 ist Pflicht** (die Wheels sind
`cp312`), deshalb ist die Engine in `pyproject.toml` auf 3.12 gepinnt und dein System-Python 3.14
bleibt außen vor.

**Vorher prüfen:** ROCm 7.2.1 verlangt den **Adrenalin-Treiber 26.2.2 oder neuer**. Version über
AMD Software → Einstellungen → System nachsehen, nicht über die WDDM-Nummer im Geräte-Manager.

Umgebung anlegen (uv holt Python 3.12 selbst):

```bash
uv venv --python 3.12 .venv-rocm
```

ROCm-Laufzeit installieren — Befehle wörtlich aus der AMD-Doku, Zeilenfortsetzung `^` gilt für CMD:

```bash
.venv-rocm\Scripts\pip install --no-cache-dir https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm_sdk_core-7.2.1-py3-none-win_amd64.whl https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm_sdk_devel-7.2.1-py3-none-win_amd64.whl https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm_sdk_libraries_custom-7.2.1-py3-none-win_amd64.whl https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/rocm-7.2.1.tar.gz
```

Dann PyTorch:

```bash
.venv-rocm\Scripts\pip install --no-cache-dir https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torch-2.9.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/torchvision-0.24.1%2Brocm7.2.1-cp312-cp312-win_amd64.whl
```

Verifizieren — auf ROCm meldet sich die AMD-Karte über die CUDA-API, das ist korrekt und kein Fehler:

```bash
.venv-rocm\Scripts\python -c "import torch; print(torch.cuda.is_available(), torch.version.hip, torch.cuda.get_device_name(0))"
```

Erwartung: `True`, eine HIP-Version, `AMD Radeon RX 7600 XT`.
Kommt `False`, ist fast immer der Treiber zu alt oder die Python-Version falsch.

**Alternative Bezugsquelle**, falls die obigen URLs nicht mehr stimmen — Index für die gfx110X-Familie
(gfx1100/1101/**1102**), Versionspins aus der dann aktuellen Doku übernehmen statt raten:

```bash
python -m pip install --index-url https://repo.amd.com/rocm/whl/gfx110X-all/ torch torchvision
```

## Pfad B — ONNX Runtime + DirectML (zweiter, gleichwertiger Pfad)

Vendor-neutral über DirectX 12, keine ROCm-Installation nötig, deutlich einfacher auszuliefern.
Preis: das Modell muss nach ONNX exportierbar sein.

```bash
uv venv --python 3.12 .venv-dml
.venv-dml\Scripts\pip install onnxruntime-directml numpy
.venv-dml\Scripts\python -c "import onnxruntime as ort; print(ort.get_available_providers())"
```

Erwartung: `DmlExecutionProvider` steht in der Liste.

## Pfad C — WSL2 / Linux (Rückfallebene)

Nur anfassen, wenn A und B beide nicht tragen. ROCm unter WSL2 ist selbst nicht für jede Karte
freigegeben — im Zweifel echtes Linux. Kostet Bequemlichkeit, deshalb bewusst dritte Wahl.

---

## Worauf beim Auswerten zu achten ist

- **Proxy zuerst.** 960 px lange Kante ist die Arbeitsauflösung fürs Interaktive, nicht 4K.
  Wenn dort die Klick-Korrektur unter 250 ms bleibt, trägt der Plan.
- **Erster Lauf lügt.** Kernel-Kompilierung und Speicherallokation verzerren; der Spike verwirft
  Warmup-Läufe automatisch.
- **VRAM ist hier nicht das Problem.** 16 GB sind für diese Klasse üppig — auf Rechenzeit achten.
- **Ein Fehlschlag ist ein Ergebnis.** Läuft ein Modell auf gfx1102 nicht, wird ein leichteres
  gewählt (EfficientTAM statt SAM 2) — nicht mehr Zeit in das schwere investiert.
