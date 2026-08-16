# ADR 002 — SAM-2-Variante, und warum der Proxy-Pfad anders begründet werden muss

**Status:** entschieden
**Datum:** 2026-08-16
**Betrifft:** M1 (Roto Core), UC-A1/A3/E7, die Proxy-Strategie aus PROJECT_PROMPT.md §4.5

## Messung

`spike_inference.py sam2`, Eingang 960×544, fp16, AOTriton aktiv, RX 7600 XT.

| Variante | `set_image` (Encoder) | `predict` (Klick) | VRAM |
|---|---|---|---|
| `sam2.1_hiera_tiny` | **279,8 ms** | **11,2 ms** | 1,03 GB |
| `sam2.1_hiera_small` | 342,6 ms | 11,4 ms | 1,06 GB |
| `sam2.1_hiera_base_plus` | 585,2 ms | 11,4 ms | 1,76 GB |

## Was diese Zahlen umwerfen

**Korrektur zu ADR 001:** dort steht, 56–80 ms für eine „SAM-2-ähnliche Encoder-Last" bei 960 px
zeigten, dass der Proxy-Pfad trägt. Diese Schätzung war um etwa Faktor vier zu optimistisch. Der
Grund ist konkret und im Nachhinein offensichtlich:

> **SAM 2 skaliert jedes Eingangsbild intern auf 1024×1024.**

Das sind 4096 Patch-Tokens, nicht die 2040, mit denen die synthetische ViT-B-Klammer gerechnet hat
— und Attention ist quadratisch in der Tokenzahl. Die Klammer war methodisch richtig, ihre
Annahme über die Tokenzahl war falsch.

**Die Folge ist keine kleine:** eine niedrigere Proxy-Auflösung macht den SAM-2-Encoder **nicht
schneller**. Sie hilft bei Decode, Matting, Kantenverarbeitung, IO und Anzeige — überall dort ist
sie weiterhin richtig. Aber wer sie als Encoder-Optimierung verkauft, optimiert etwas, das gar
nicht von der Auflösung abhängt.

## Was trotzdem trägt — und zwar besser als gedacht

Die eigentliche Struktur der Messung ist die **Trennung zwischen Encoder und Decoder**:

- `set_image` läuft **einmal pro Frame**, ist teuer und **vollständig cachebar**.
- `predict` läuft **pro Klick**, kostet 11 ms und ist von der Modellgröße praktisch unabhängig.

Damit ist UC-E7 nicht knapp erfüllt, sondern deutlich: **11 ms gegen ein 250-ms-Budget**, Faktor 20
Reserve. Aber nur, wenn das Embedding bereits im Cache liegt. Der Frame-Cache ist damit kein
Performance-Feature, sondern **die tragende Konstruktion des interaktiven Arbeitens**.

Hochgerechnet mit `tiny`:

| Vorgang | Kosten |
|---|---|
| Frame zum ersten Mal anfassen | ~280 ms — spürbar, aber einmalig |
| Jede weitere Korrektur auf demselben Frame | 11 ms — sofort |
| Propagation über 100 Frames | ~28 s — im 60-s-Budget aus §4.5 |
| Prefetch der Nachbarframes im Hintergrund | macht den 280-ms-Einstieg unsichtbar |

## Entscheidung

1. **`sam2.1_hiera_tiny` ist das interaktive Modell** in M1. 280 ms gegen 585 ms bei base_plus,
   und der Klick-Pfad ist ohnehin gleich schnell. Die Qualitätsdifferenz rechtfertigt den
   Faktor zwei im Encoder für interaktives Arbeiten nicht.
2. **`sam2.1_hiera_base_plus` ist die Hintergrund-Qualitätsstufe.** Läuft, während weitergearbeitet
   wird, und ersetzt das Proxy-Ergebnis im Cache.
3. **Der Frame-Cache (Embedding je Frame) wird in M1 gebaut, nicht später.** Ohne ihn ist jede
   Interaktion 280 ms statt 11 ms — das ist der Unterschied zwischen Werkzeug und Warteschlange.
4. **Prefetch in Blickrichtung:** beim Öffnen eines Frames die Nachbarn im Hintergrund encodieren.
   Billig zu bauen, macht den Einstiegs-Hit unsichtbar.
5. **Die Proxy-Auflösung bleibt** — aber mit korrigierter Begründung: sie spart Decode, Matting
   und Anzeige, nicht den Encoder.

## Offen

- **Qualitätsvergleich tiny vs. base_plus an echtem Material.** Die Entscheidung für tiny ist
  aus Latenz begründet; ob die Maskenqualität für Studio-Arbeit reicht, ist ungemessen.
- **Korrektheitsprüfung der AOTriton-Kernel** (aus ADR 001) steht weiterhin aus — diese Messung
  lief mit aktivierten experimentellen Kerneln.
- **EfficientTAM** als möglicher schnellerer Encoder ist noch nicht gemessen. Erst relevant, wenn
  280 ms sich im echten Arbeitsablauf als zu träge erweisen.
