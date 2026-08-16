/**
 * Projekt-weite Konstanten.
 *
 * Die Framerate steht hier und nicht verstreut in den Modulen: sie übersetzt in
 * MOTIF zwischen `18f` und Millisekunden und bestimmt zugleich, wie viele Frames
 * exportiert werden. Zwei Orte mit je einer 25 wären zwei Orte zum Auseinanderlaufen.
 *
 * Ganzzahlig in v1 — NTSC-Drop-Frame erst, wenn echtes Material es erzwingt
 * (PROJECT_PROMPT.md §12, Entscheidung 5).
 */
export const FPS = 25;
