# RotoScope Studio

KI-gestütztes Rotoscoping, komponierbare Transitions und Farb-Look-Transfer aus Referenzbildern.
Lokal, offline, jeder Parameter offen.

**Das verbindliche Briefing ist [PROJECT_PROMPT.md](PROJECT_PROMPT.md).** Architektur, Use-Cases,
Bausteine, Milestones und die Sprachdefinition stehen dort — nicht hier.

Status: **M0 — Skelett steht und läuft. Hardware-Spike zur Hälfte gemessen.**

| M0-Punkt | Stand |
|---|---|
| Monorepo, Engine, CLI | ✅ läuft |
| Web-App zeigt Frame 0 (mediabunny + WebCodecs) | ✅ verifiziert, 1280×720 in ~31 ms dekodiert |
| Inferenz-Pfad B (ONNX Runtime + DirectML) | ✅ installiert, `DmlExecutionProvider` gemeldet |
| Inferenz-Pfad A (PyTorch + ROCm) | ⬜ offen — mehrere GB Download, braucht Treiber-Check |
| Latenz-Messung mit echtem Modell | ⬜ offen — hängt an Pfad A |

---

## Zielumgebung

| | |
|---|---|
| GPU | AMD Radeon RX 7600 XT (Navi 33, gfx1102), 16 GB VRAM |
| OS | Windows 11 |
| Inferenz | **kein CUDA/TensorRT** — PyTorch-ROCm oder ONNX Runtime + DirectML (§4.5 im Briefing) |
| Node | ≥ 20 (getestet: 25.8.1) |
| Python | **3.12** für die Engine (nicht 3.13/3.14 — dafür gibt es keine Torch-Wheels). uv verwaltet das. |

## Schnellstart

Abhängigkeiten des Frontends installieren:

```bash
npm install
```

Engine starten (uv holt Python 3.12 selbst, falls nicht vorhanden):

```bash
npm run engine
```

Web-App starten (zweites Terminal):

```bash
npm run dev
```

Umgebung prüfen:

```bash
npm run doctor
```

## M0-Abnahme

1. `npm run engine` → `http://127.0.0.1:8787/health` antwortet `{"status":"ok",...}`
2. `npm run dev` → Video per Datei-Auswahl laden, Frame 0 erscheint im Canvas, Engine-Badge ist grün
3. `npm run rotoc -- --version` gibt eine Version aus
4. **Der Hardware-Spike ist gelaufen** und `docs/decisions/001-inferenz-backend.md` enthält
   gemessene Zahlen statt Platzhalter → siehe [scripts/spike/README.md](scripts/spike/README.md)

Punkt 4 ist kein Formalismus: ohne diese Zahlen wird M1 nicht geplant.

## Struktur

```
apps/studio-web/    React + Vite + TS, Viewer, später Timeline und Inspector
apps/engine-py/     FastAPI, Modell-Backends hinter einem Interface
apps/cli/           rotoc — headless, zero-dependency Node
packages/           motif-lang, grade-core, mask-ops … (ab M2/M3)
scripts/spike/      Hardware-Spike: welches Inferenz-Backend trägt auf dieser Karte?
docs/decisions/     ADRs
docs/licenses/      Pro Modell/Library eine Datei. Pflicht vor dem Einbinden.
```
