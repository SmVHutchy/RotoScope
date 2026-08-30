# Changelog

Rekonstruiert aus der Git-History (22 Commits, 2026-08-16 bis 2026-08-17). Es gibt noch keine
Releases; die Version steht durchgehend auf `0.0.1`. Gegliedert nach Milestones, weil die
History selbst so gegliedert ist.

## Unveröffentlicht

### M3 — Transitions, MOTIF, Felder

- Feldgenerator Stufe 3: Raster als Form (Punkte, Blöcke, Dithering, Korn); nahtlose Loops,
  Kantenglättung über `fwidth`, Feld-Shader auf ES 3.00
- Feldgenerator Stufe 2: Repeater, Farbe über den Kopienindex
- Feldgenerator Stufe 1: `field-core`, Shader, zweite Ansicht, Inspector stabilisiert
- Tiefenkarten über Depth Anything V2 Small (ONNX/DirectML) — 84 ms bei 720p
- `grade-core`: Farbtransfer nach Reinhard und MKL, `.cube`-LUT mit Rückleseprüfung
- Bewegte Übergänge: beide Clips laufen während der Überblendung weiter
- Zwei Clips: Ausstiegsframe aus A, Einstiegsframe aus B, je frei wählbar
- MP4-Export über WebCodecs mit Selbstprüfung der geschriebenen Datei
- MOTIF v0.1: Sprache, MIR, Approve-Snapshots, wirksame Dauer und Ease
- Transition-Workbench mit 125 gl-transitions
- UI auf die Schrift Endless umgestellt, Beschriftung ASCII-rein
- Aufräumen: Dekodieren vom Zeichnen getrennt, Uniform-Locations gecacht, toter Code entfernt

### M1 — Roto (gestoppt)

- **Kurswechsel:** Roto gestoppt, siehe [ADR 003](docs/decisions/003-roto-vorerst-ueber-sammie.md).
  Masken kommen vorerst aus Sammie-Roto 2.
- Segmenter-Interface, Frame-Cache, Klick-Segmentierung mit Overlay
- Umgebungen vereint, SAM 2 lizenzgeprüft und vermessen → [ADR 002](docs/decisions/002-sam2-variante-und-frame-cache.md)

### M0 — Fundament

- ROCm-Pfad gemessen, AOTriton aktiviert, Backend entschieden → [ADR 001](docs/decisions/001-inferenz-backend.md)
- Web-Viewer verifiziert, DirectML-Pfad bestätigt, `/device` crash-fest
- Monorepo-Skelett, Engine, CLI, Hardware-Spike

### Plattform

- Mac-tauglich: plattformabhängige Extras, CoreML-Pfad, Modell- und Testclip-Skripte;
  Spike erkennt MPS. **Auf Apple Silicon ungemessen.**
