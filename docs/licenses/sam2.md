# SAM 2 (Segment Anything Model 2)

| | |
|---|---|
| Rolle | Interaktive Segmentierung und Propagation — UC-A1, UC-A2, UC-A3 (M1) |
| Quelle | https://github.com/facebookresearch/sam2 |
| Lizenz Code | **Apache-2.0** |
| Lizenz Checkpoints | **Apache-2.0** — ausdrücklich auch für Modellgewichte, Demo- und Trainingscode |
| Kommerziell nutzbar | **Ja, uneingeschränkt** |
| Geprüft am | 2026-08-16 |

## Bewertung

Apache-2.0 ist die entspannteste Lizenz, die in diesem Projekt vorkommt: kommerzielle Nutzung,
Weitergabe und Änderungen erlaubt, kein Copyleft. Auflagen sind Attribution und ein Hinweis auf
geänderte Dateien — beides erfüllt, solange der Lizenztext mitgeliefert und nichts umbenannt wird.

**Damit ist SAM 2 das lizenzsicherste Modell im Plan.** Das ist ein zusätzliches Argument dafür,
es als interaktiven Arbeitspferd-Pfad zu setzen (PROJECT_PROMPT.md §4.1) und SAM 3 — mit
Meta-eigener, noch ungeprüfter Lizenz — auf den Hintergrund-Pass zu beschränken.

## Varianten

Geschwindigkeiten laut Repo, gemessen auf einer A100 — **nicht auf unsere Hardware übertragbar**,
nur als relative Ordnung brauchbar.

| Variante | Parameter | A100-FPS | Einschätzung für die RX 7600 XT |
|---|---|---|---|
| `sam2.1_hiera_tiny` | 38,9 M | 91,2 | Kandidat für den Proxy-/Interaktiv-Pfad |
| `sam2.1_hiera_small` | 46 M | 84,8 | Kandidat für den Proxy-/Interaktiv-Pfad |
| `sam2.1_hiera_base_plus` | 80,8 M | 64,1 | Kandidat für die Hintergrund-Qualitätsstufe |
| `sam2.1_hiera_large` | 224,4 M | 39,5 | vermutlich nur Batch |

Checkpoints: `https://dl.fbaipublicfiles.com/segment_anything_2/092824/<name>.pt`

## Hinweis zur Installation

Das Paket baut optional CUDA-Erweiterungen. Auf ROCm/Windows ist das der wahrscheinlichste
Stolperstein — dann mit `SAM2_BUILD_CUDA=0` installieren; die betroffenen Kernel sind für die
Bildsegmentierung nicht erforderlich.
