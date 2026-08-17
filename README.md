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
| MOTIF v0.1: Lexer, Parser, Serialisierer, MIR (UC-C3) | ✅ 12 Tests, `npm test` |
| `.motif` live im Panel, speichern, laden | ✅ |
| Approve-Snapshots mit Hash statt Presets (UC-C2) | ✅ inhaltsadressiert, wiederherstellbar |
| Dauer und Ease wirken auf die Wiedergabe (UC-B3, Teil) | ✅ 6 Kurven inkl. Spring |
| **MP4-Export mit Selbstprüfung** | ✅ WebCodecs, ~1 s für 36 Frames bei 1280×720 |
| Zeitachse über GSAP: Timeline, Stagger, Scrub | ⬜ |
| Headless rendern über `rotoc` (ohne Browser) | ⬜ braucht eine GL-Umgebung in Node |

**Bewegte Übergänge:** A spielt seine letzten Frames bis zum gewählten Ausstiegspunkt, B seine
ersten ab dem Einstiegspunkt — beide laufen während der Überblendung weiter. Ein Standbild-Übergang
ist derselbe Weg mit stehenden Folgen, kein zweiter Codepfad.

**Export:** Kodiert wird im Browser über WebCodecs — derselbe Renderer, der die Vorschau zeichnet.
Vorschau und Ausgabe können damit nicht auseinanderlaufen. Die geschriebene Datei wird sofort wieder
geöffnet und auf Spur, Maße und Laufzeit geprüft; schlägt das fehl, bricht der Export ab, statt eine
kaputte Datei auszuliefern.

Der echte headless-Pfad (`rotoc render` ohne Browser) ist **nicht** dasselbe und fehlt noch — er
braucht eine eigene GL-Umgebung in Node.

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

Voraussetzungen: **Node ≥ 20**, **[uv](https://docs.astral.sh/uv/)** (holt Python 3.12 selbst),
und für die Testclips **ffmpeg**.

```bash
npm install
npm run models        # Checkpoints holen (nicht im Repo, siehe unten)
npm run testclips     # zwei Testclips erzeugen, braucht ffmpeg
```

Engine starten — der Befehl unterscheidet sich je Plattform, weil der Beschleuniger
ein anderer ist:

```bash
npm run engine:mac
```

```bash
npm run engine:win
```

Web-App im zweiten Terminal, danach `http://localhost:5173`:

```bash
npm run dev
```

Umgebung prüfen (Node, Engine, verfügbare Inferenz-Backends):

```bash
npm run doctor
```

### Plattformen

Der Code ist überall derselbe; nur der Beschleuniger wechselt. Die Engine meldet
über `/device`, worauf sie tatsächlich läuft.

| | Windows (Entwicklungsmaschine) | macOS |
|---|---|---|
| Inferenz | PyTorch + ROCm (AMD), ONNX Runtime + DirectML | ONNX Runtime + CoreML, optional PyTorch mit MPS |
| Extra | `--extra rocm --extra directml` | `--extra coreml`, optional `--extra mps` |
| Tiefenkarten | ✅ gemessen: 84 ms bei 720p | ✅ derselbe ONNX-Pfad, ungemessen |
| Segmentierung (SAM 2) | ✅ gemessen | ⬜ braucht `--extra mps`, ungemessen |
| Web-App, Felder, Transitions | ✅ | ✅ reines WebGL2, plattformunabhängig |

Die ROCm-Abhängigkeiten sind auf `sys_platform == 'win32'` beschränkt — auf einem Mac
werden sie übersprungen statt den Installationslauf abzubrechen.

**Auf dem Mac ungemessen:** Alle Zahlen in den ADRs stammen von einer AMD RX 7600 XT
unter Windows. Sie sagen nichts über Apple Silicon. Wer dort arbeitet, misst neu —
`python scripts/spike/spike_inference.py env` ist der Einstieg.

### Schrift

Die Oberfläche ist auf **Endless** gesetzt — eine Schrift mit 94 Glyphen, reines ASCII.
Die Datei liegt **nicht im Repo**: sie trägt keine Lizenzangabe, und fremde Schriften
weiterzugeben ist keine Kleinigkeit. Wer sie hat, legt sie nach
`apps/studio-web/public/fonts/Endless.ttf`; ist sie systemweit installiert, findet die
App sie ohnehin über `local('Endless')`.

Ohne sie fällt die Oberfläche auf die Systemschrift zurück und funktioniert vollständig
— nur das Satzbild ist ein anderes. Die Beschriftung ist bewusst umlautfrei gehalten,
weil Endless keine Umlaute hat; das bleibt so, damit beide Fälle gleich aussehen.

### Checkpoints

Modelle liegen **nicht** im Repo: mehrere hundert MB, und ihre Lizenzen erlauben eine
Weitergabe nicht durchgehend. `npm run models` holt genau die, deren Lizenz geprüft und
freigegeben ist. Jedes hat eine Datei unter [docs/licenses/](docs/licenses/) — ohne die
wird nichts eingebunden.

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
