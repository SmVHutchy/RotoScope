# ADR 004 — WebGL2 für die Transition-Runtime, nicht WebGPU

**Status:** entschieden
**Datum:** 2026-08-16
**Betrifft:** PROJECT_PROMPT.md §5 (Rendering), UC-B9

## Kontext

Das Briefing sagt: „Die Pixel macht WebGPU über gl-transition-kompatible Shader."
Diese beiden Halbsätze passen nicht zusammen.

gl-transitions sind **GLSL-Fragmentfunktionen** (`vec4 transition(vec2 uv)`, `texture2D`,
`gl_FragColor`). WebGPU spricht **WGSL**. Um die 125 Übergänge unter WebGPU zu fahren, müsste
jeder einzelne transpiliert werden — entweder von Hand oder über einen Übersetzer, den jemand
pflegen muss. Der Ertrag wäre null: diese Shader sind ein Fullscreen-Pass mit zwei Texturen und
rechnen auf einer RX 7600 XT im einstelligen Millisekundenbereich.

## Entscheidung

**Die Transition-Runtime läuft auf WebGL2 mit GLSL-ES-1.00-Shadern.** Die gl-transitions-Sammlung
wird damit unverändert genutzt, ohne Übersetzungsschritt.

Gemessen: 125 Übergänge geladen, Renderzeit pro Frame unter 1 ms bei 1280×720.

## Wo WebGPU trotzdem hingehört

Nicht ersatzlos gestrichen, sondern zugespitzt: **WebGPU ist für Compute da, nicht für die
Übergänge.** Kandidaten sind Arbeiten, die als Fragment-Shader unbequem sind — Optical-Flow-artige
Passes, Histogramme für den Look-Transfer (UC-D1), Kantenverarbeitung an Masken. Wenn davon etwas
gebraucht wird, kommt WebGPU als zweiter Kontext dazu, statt den funktionierenden Übergangspfad
umzubauen.

## Konsequenzen

- Ein Übersetzungsschritt weniger im Projekt, die Bibliothek ist ab Tag eins vollständig nutzbar.
- Breitere Browserunterstützung als Beigabe — WebGL2 läuft überall, WebGPU unter Firefox/Linux
  noch nicht (ADR 001 hatte darauf schon hingewiesen).
- MOTIF-Node-Signaturen bleiben gl-transition-kompatibel, wie im Briefing gefordert. Der Vertrag
  ist der GLSL-Vertrag.
- Sollte doch ein WGSL-Pfad nötig werden (etwa für ein WebGPU-only-Feature), ist die Transpilation
  eine eigene Entscheidung mit eigener Begründung — nicht ein stiller Umbau.
