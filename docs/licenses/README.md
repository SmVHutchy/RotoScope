# Lizenzen

**Regel (Master-Prompt, Regel 4): Kein Modell und keine Library wird eingebunden, bevor hier
eine Datei dazu existiert.** Rahmen ist „erstmal privat, Option auf kommerziell offenhalten"
(PROJECT_PROMPT.md §0.1) — also dokumentieren statt blockieren, aber GPL-Code bleibt draußen.

Eine Datei pro Abhängigkeit: `<name>.md` mit Lizenz, Quelle, kommerzieller Nutzbarkeit und
dem Datum der Prüfung.

## Ausdrücklich nicht einbinden

| Projekt | Lizenz | Warum trotzdem im Briefing |
|---|---|---|
| Sammie-Roto-2 | GPL-3.0 | Referenz für Bedienkonzept und Modellauswahl. Kein Code. |
| color-matcher | GPL-3.0 | Referenz für Reinhard/MKL/HM-MVGD-HM. Verfahren selbst implementieren. |
| aubio | GPL-3.0 | Nur als separater Prozess aufrufbar, nicht linken. Sonst Essentia. |

## Zu prüfen vor Einbindung

| Modell / Library | Rolle | Milestone | Status |
|---|---|---|---|
| SAM 3 | Text-Prompt-Segmentierung (UC-A11) | M1 | offen — Meta-eigene Lizenz, **nicht** Apache annehmen |
| SAM 2 | interaktive Segmentierung | M1 | **geklärt: Apache-2.0, Code UND Checkpoints, kommerziell frei** → [sam2.md](sam2.md) |
| EfficientTAM | Proxy-Pfad | M1 | offen |
| MatAnyone 2 | Matting (UC-A4) | M2 | offen — kommerzielle Nutzung fraglich |
| CoTracker3 | Punkt-Stabilität (UC-A5) | M2 | offen |
| ProPainter | Object Removal (UC-A7) | M3 | offen — S-Lab, non-commercial prüfen |
| DiffuEraser | Object Removal, Qualitätsstufe | M3 | offen |
| mediabunny | Media-I/O im Browser | M0 | **geklärt: MPL-2.0, kommerziell nutzbar** → [mediabunny.md](mediabunny.md) |
| onnxruntime-directml | Inferenz-Pfad B | M0 | MIT (Microsoft) — bestätigen und Datei anlegen |
| gl-transitions | Transition-Bibliothek | M3 | MIT — unkritisch, trotzdem dokumentieren |
