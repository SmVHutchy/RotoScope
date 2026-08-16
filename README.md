# RotoScope Studio

KI-gestütztes Rotoscoping, komponierbare Transitions und Farb-Look-Transfer aus Referenzbildern.
Lokal, offline, jeder Parameter offen.

**Das verbindliche Briefing ist [PROJECT_PROMPT.md](PROJECT_PROMPT.md).** Architektur, Use-Cases,
Bausteine, Milestones und die Sprachdefinition stehen dort — nicht hier.

Status: **M0 abgeschlossen, M1 begonnen** (2026-08-16).

| M0-Punkt | Stand |
|---|---|
| Monorepo, Engine, CLI | ✅ läuft |
| Web-App zeigt Frame 0 (mediabunny + WebCodecs) | ✅ verifiziert, 1280×720 in ~31 ms dekodiert |
| Inferenz-Pfad A (PyTorch + ROCm) | ✅ `torch 2.9.1+rocm7.2.1`, HIP 7.2, GPU sichtbar |
| Inferenz-Pfad B (ONNX Runtime + DirectML) | ✅ `DmlExecutionProvider` verfügbar |
| Latenz gemessen, Backend entschieden | ✅ [ADR 001](docs/decisions/001-inferenz-backend.md) |
| Messung mit echten SAM-2-Gewichten | ✅ [ADR 002](docs/decisions/002-sam2-variante-und-frame-cache.md) |

**M1 — Roto: gestoppt** ([ADR 003](docs/decisions/003-roto-vorerst-ueber-sammie.md)). Erreicht wurde
Klick-Segmentierung mit Frame-Cache (12 ms pro Klick) — also etwa 10 % dessen, was
[Sammie-Roto 2](https://github.com/Zarxrax/Sammie-Roto-2) fertig kann. Masken kommen deshalb
vorerst aus Sammie; gebaut wird nur noch, was es sonst nirgends gibt.

Die **Engine-Endpunkte laufen weiter** (`/roto/session`, `/embed`, `/click`) und sind per HTTP
nutzbar. Die zugehörige **Oberfläche ist nicht mehr in der App** — sie wurde von der
Transition-Ansicht abgelöst und liegt in Commit `fd6c7a5`, falls sie zurückkommen soll.

**M3 — Transitions + MOTIF: laufend**

| Aufgabe | Stand |
|---|---|
| gl-transitions als Node-Katalog (UC-B9) | ✅ 125 Übergänge, MIT/BSD |
| WebGL2-Runtime ([ADR 004](docs/decisions/004-webgl2-statt-webgpu.md)) | ✅ < 1 ms pro Frame bei 1280×720 |
| Parameter-Inspector, jeder Parameter live (UC-C1) | ✅ Tweakpane, automatisch aus den Uniforms |
| Übergang zwischen zwei echten Frames (UC-B1) | ✅ |
| `.motif`-Format: lesen, schreiben, approven (UC-C2/C3) | ⬜ als Nächstes |
| Zeitachse über GSAP, Ease und Dauer (UC-B3) | ⬜ |

Ausprobieren: `npm run dev`, dann `http://localhost:5173/?clip=/dev-sample.mp4` — Übergang wählen,
Regler ziehen, `progress` scrubben.

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
