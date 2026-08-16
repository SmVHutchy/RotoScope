# ADR 003 — Roto-Eigenbau gestoppt, Masken kommen vorerst aus Sammie-Roto 2

**Status:** entschieden
**Datum:** 2026-08-16
**Betrifft:** M1, die gesamte Milestone-Reihenfolge

## Kontext

Nach vier Commits war der Stand: Klick-Segmentierung im Browser, 12 ms pro Klick, Frame-Cache.
Das ist etwa **10 % dessen, was Sammie-Roto 2 seit über einem Jahr fertig kann** — und Sammie
kann zusätzlich Matting, Propagation, Object Removal und Export.

Der Vergleich der drei Produktsäulen fällt eindeutig aus:

| | Sammie-Roto 2 | RotoScope Studio | Stand bei uns |
|---|---|---|---|
| KI-Masken | vollständig | dasselbe nochmal | 10 % |
| Masken als editierbare Bezier-Kurven | nein | UC-A5 | nicht begonnen |
| Transitions + MOTIF + Config-Tool | nein | die eigentliche Idee | nicht begonnen |
| Look-Transfer aus Referenzbildern | nein | UC-D | nicht begonnen |
| AE/Nuke/Resolve-Anbindung | nur Dateien | UC-A13, UC-E6 | nicht begonnen |

**Alles, was dieses Werkzeug von Sammie unterscheidet, war nicht angefangen.** Die Arbeit lief auf
dem einen Teil, den es bereits gibt.

„Roto zuerst" war nicht falsch begründet: es war der technisch schwerste Teil, und auf einer
AMD-Karte unter Windows war völlig offen, ob er überhaupt trägt. **Diese Frage ist beantwortet**
(ADR 001, ADR 002) — damit hat die Entscheidung ihren Zweck erfüllt.

## Entscheidung

**Der Roto-Eigenbau wird gestoppt.** Masken kommen vorerst aus Sammie-Roto 2 als Alpha-Sequenz
oder ProRes 4444 und werden importiert.

Lizenzrechtlich unbedenklich: Sammie ist GPL-3.0, aber **das betrifft Code, nicht Benutzung**.
Sammie als Werkzeug einzusetzen und seine Ausgabedateien zu laden infiziert nichts.

**Was bleibt und weiter benutzt wird:**

- Das `Segmenter`-Interface und das SAM-2-Backend. Läuft, ist vermessen, kostet nichts im Stillstand.
- Der Frame-Cache — er wird für die Transition-Vorschau ohnehin gebraucht.
- Die Engine, die CLI, der Viewer, die gesamte Messinfrastruktur.
- ADR 001 und ADR 002 bleiben gültig; die Hardware-Erkenntnisse gelten unabhängig davon.

**Was entfernt wurde:** das halbfertige, nicht verdrahtete Video-Backend (`sam2_video_backend.py`).
Ungetesteter toter Code ist schlechter als kein Code — die Datei steht im Git-Verlauf, falls
Propagation zurückkommt.

## Neue Reihenfolge

1. **MOTIF + Config-Tool** — gl-transitions importieren, Parameter live tweaken, approven. Der Kern
   der ursprünglichen Idee, im Browser gebaut, ohne GPU-Risiko.
2. **Look-Transfer** — kleinster eigenständiger Nutzen, Referenzbild rein, `.cube` raus.
3. **Bezier-Splines (UC-A5)** — der eine Roto-Teil, den Sammie wirklich nicht hat. Kommt zurück,
   wenn es etwas gibt, wofür die Kurven gebraucht werden.

## Konsequenzen

- Der Import von Sammie-Ausgaben (Alpha-Sequenz, ProRes 4444) wird ein echtes Feature und braucht
  einen eigenen Pfad im Viewer.
- Die Masken-Endpunkte der Engine bleiben bestehen, wachsen aber nicht weiter.
- Wenn der Bezier-Teil zurückkommt, ist die Begründung eine andere als heute: nicht „wir brauchen
  Masken", sondern „wir brauchen Kurven, die man in AE und Nuke anfassen kann".
- **Prüfen, sobald der Import steht:** ob Sammie im täglichen Gebrauch wirklich reicht. Falls die
  Reibung zwischen zwei Programmen zu groß wird, ist das ein Argument für den Eigenbau — aber
  dann ein gemessenes, kein vermutetes.
