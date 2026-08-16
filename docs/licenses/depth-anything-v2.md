# Depth Anything V2

| | |
|---|---|
| Rolle | Tiefenkarte je Frame — Parallax-Transition (UC-B10), später Tiefen-Matte (UC-A12) |
| Quelle | https://huggingface.co/depth-anything/Depth-Anything-V2-Small |
| Geprüft am | 2026-08-16 |

## Die Lizenz hängt an der Größe — und das ist der ganze Punkt

| Variante | Lizenz | Kommerziell |
|---|---|---|
| **Small** | **apache-2.0** | **ja** |
| Base | prüfen | offen |
| **Large** | **cc-by-nc-4.0** | **nein** |

Das ist keine Kleinigkeit: dasselbe Modell in zwei Größen, zwei völlig verschiedene Lizenzen.
Wer nach Gefühl die größte Variante nimmt, hat sich eine Nicht-kommerziell-Klausel ins Produkt
geholt, ohne es zu merken.

**Entscheidung: ausschließlich `Small`.** Passt zum Rahmen „privat, Option auf kommerziell offen"
(PROJECT_PROMPT.md §0.1) und ist auf einer RX 7600 XT ohnehin die vernünftige Wahl.

**Base und Large sind bis zur Klärung gesperrt.** Wer sie einbinden will, prüft vorher ihre Lizenz
und trägt sie hier ein.

## Einordnung

Für eine Parallax-Transition reicht *relative* Tiefe vollkommen — es geht um Vordergrund gegen
Hintergrund, nicht um Metermaß. Das ist genau die Disziplin, in der die kleine Variante stark ist,
und sie ist laut Modellkarte um ein Vielfaches schneller als die großen.
