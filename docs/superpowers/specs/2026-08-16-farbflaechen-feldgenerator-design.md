# Feldgenerator für Farbflächen — Design

**Datum:** 2026-08-16
**Status:** zur Durchsicht
**Betrifft:** neue Säule in RotoScope Studio neben Transitions und MOTIF

---

## 1 Zweck

Ein Werkzeug, das Farbflächen im Stil von acht Referenzbildern erzeugt und bewegt:
konzentrische Konturen um weiche Formen, heiße Paletten auf Schwarz, Riso-Korn, Halbton, Glow.

Die Ausgabe dient drei Zwecken, die der Nutzer alle drei benannt hat:

1. **Bewegte Flächen für den Schnitt** — Loops und Hintergründe als MP4 oder mit Alphakanal
2. **Echte Vektoren** — SVG-Pfade, in Illustrator oder AE weiterverwendbar
3. **Zulieferer für die Transitions** — das Feld als Maske und Displacement-Quelle

## 2 Was die Referenzen wirklich verlangen

Die erste Analyse las alle acht Bilder als „konzentrische Konturen". **Das war falsch und hätte
vier der acht Vorlagen unerreichbar gemacht.** Die Zerlegung Bild für Bild:

| Bild | Mechanismus | Verlangt |
|---|---|---|
| 1 Club | Superellipsen-Ringe, Bänder von außen nach innen, starkes Leuchten | Ringprofil, Glow |
| 2 Rohre | Striche entlang orthogonaler Pfade, Bänder **parallel zum Strich**, saubere Kreuzungen | Pfade, **exakte Vereinigung** (`min`, nicht smooth-min) |
| 3 Stapel | **N Kopien** einer Ellipse, je versetzt und skaliert, Farbe wandert über den Kopienindex | Repeater |
| 4 Neon | Pfadfeld mit sehr weichem Abfall, Rampe Cyan → Gelb → Rot | Ringprofil mit **Härteregler** |
| 5 Amöbe | Doppellappen aus smooth-min, Rauten im Kern, **breite Bänder mit dünnen Trennlinien** | Superellipse mit Exponent, zweiteiliges Ringprofil |
| 6 Riso | **Verjüngte** Striche, spitz auslaufend, gespiegelt | Pfad mit veränderlichem Radius |
| 7 Halbton | Punktraster **als Form**, Größe aus dem Feld | Raster als Erzeuger, nicht als Finish |
| 8 Bitmap | Blockdithering über Verlauf, spärlich | Raster + Hintergrundverlauf |

**Zwei Erkenntnisse, die das Modell prägen:**

- Eine **Superellipse mit veränderlichem Exponenten** fährt von Raute (1) über Kreis (2) und
  Squircle (4) bis Quadrat. Eine Primitive deckt fast das ganze Formenspektrum ab.
- **Spiegelung** ist eine Feldoperation, kein Sonderfall: Bild 5 und 6 sind achsensymmetrisch,
  und im Feld kostet das eine Zeile (`abs` auf der Achse vor der Auswertung). Gehört in Stufe 1.
- **Smooth-min ist nicht immer richtig.** Für organische Lappen (Bild 5) ja, für Rohrkreuzungen
  (Bild 2) nein — dort beult es genau da aus, wo die Vorlage sauber ist. Beide Verknüpfungen
  müssen wählbar sein.

## 3 Architektur

Neues Paket `packages/field-core` (TypeScript, ohne Browser-Abhängigkeit) und eine zweite Ansicht
in `apps/studio-web`.

`field-core` enthält **Knotendefinitionen**, die je zwei Fassungen mitbringen: eine
Referenzimplementierung in TypeScript und ein GLSL-Schnipsel. Die TS-Fassung ist testbar wie
`grade-core` und liefert die Werte für die SVG-Ausgabe; die GLSL-Fassung wird zum Shader
zusammengesetzt. **Beide stammen aus derselben Definition** — das ist die Absicherung dagegen,
dass Vorschau und Vektorausgabe auseinanderlaufen. Es ist derselbe Grundsatz, der schon zweimal
getragen hat: ein Mechanismus, mehrere Ausgänge.

Die neue Ansicht teilt sich Renderer, Inspector, MOTIF-Panel und Export mit der
Transition-Werkbank. Neu sind nur der Viewer ohne Clip-Slots und der Feldgraph.

```
packages/field-core/
  src/shapes.ts      Superellipse, Kapsel, Ring — TS-Referenz + GLSL
  src/combine.ts     Vereinigung, Abzug, smooth-min, Spiegelung
  src/repeat.ts      Repeater: N Kopien mit Delta-Transform und Index
  src/profile.ts     Ringprofil: Abstandskurve, Härte, Band + Trennlinie
  src/palette.ts     Rampen in Lab (nutzt grade-core), Presets
  src/raster.ts      Punkt, Block, Dither, Korn
  src/isolines.ts    Marching Squares fuer die SVG-Ausgabe
  src/codegen.ts     Graph -> GLSL
  src/graph.ts       Datenmodell des Feldgraphen
```

## 4 Das Feldmodell

```
Formen  ─┐
Pfade   ─┼→ Feld d ─→ Ringprofil ─→ Palette ─→ Raster/Finish ─→ Bild
Repeater ┘              (Haerte,       (Lab)      (Punkt, Block,
                     Band + Linie)                 Korn, Glow)
```

Der **Repeater sitzt vor dem Feld**: er vervielfacht eine Form und gibt jeder Kopie einen Index,
den die Palette lesen kann. Damit ist Bild 3 dieselbe Maschine wie Bild 5 — nur liest die Rampe
den Kopienindex statt den Abstand.

**Ringprofil.** Nicht ein Sägezahn, sondern vier Größen: Abstand zwischen den Bändern, eine
**Abstandskurve** für ungleichmäßigen Rhythmus, eine **Härte** (hart gestuft wie Bild 5 bis
fließend wie Bild 4) und eine **Trennlinienbreite** für die dünnen dunklen Linien aus Bild 5.

> Der ungleichmäßige Ringrhythmus ist kein Feinschliff. Gleichabständige Ringe wirken sofort
> generiert; in Bild 5 stehen die äußeren enger als die inneren. Das gehört in Stufe 1.

**Harte Regel für die Bedienbarkeit:** Jeder Wert ist ein **Uniform**, niemals eine einkompilierte
Konstante. Neu übersetzt wird der Shader nur, wenn sich die *Struktur* ändert — eine Form kommt
dazu, eine Verknüpfung wechselt. Andernfalls stünde bei jedem Reglerzug die Shader-Übersetzung im
Weg (10–100 ms) und die Bedienung wäre unbrauchbar. Obergrenze: **16 Formen pro Feld**, begrenzt
durch die Uniform-Kapazität von WebGL2.

## 5 Palette-Presets

Ein Preset ist keine Farbliste. Aus den Referenzen fallen zwei Strukturmerkmale, die im Format
stehen müssen, sonst treffen die Presets den Charakter nicht:

- **Wo sitzt der Kontrastpol** — im Kern (Club, Neon) oder ganz außen (Stapel)?
- **Was liest die Rampe** — den Abstand oder den Kopienindex?

```ts
type PalettePreset = {
  name: string;
  background: Color | Gradient;   // Bild 2 und 8 haben Verlaeufe
  stops: Color[];                 // geordnet, von aussen nach innen
  source: 'distance' | 'index';   // Bild 3 liest den Kopienindex
  repeat: number | null;          // Rampe alle N Baender wiederholen
  separator: Color | null;        // duenne Trennlinie (Bild 5)
};
```

Aus den Bildern gelesen, als mitgelieferte Presets:

| Name | Hintergrund | Rampe | Besonderheit |
|---|---|---|---|
| Club | fast schwarz | Gelb → Orange → Rot → Magenta → Violett | Kontrastpol im Kern |
| Rohrpost | Verlauf Dunkelbraun → Orange | Gelb → Orange → Rot | wiederholend |
| Stapel | Schwarz mit Korn | Orangerot → Gelb → Grün | liest den Kopienindex — **erst ab Stufe 2 nutzbar**, weil es den Repeater braucht |
| Neon | Anthrazit | Cyan → Gelb → Rot | weich, kein Stufen |
| Amöbe | sattes Rot | Schwarz → Lime | mit Trennlinien |
| Riso | Zinnoberrot | nur Schwarz | einfarbig |

Interpoliert wird **in Lab über `grade-core`**. In sRGB gemischt ergibt Rot nach Gelb ein
schlammiges Braun in der Mitte — genau der Unterschied zwischen „sieht aus wie die Vorlage" und
„sieht aus wie ein Generator".

## 6 Zeit

Drei Betriebsarten über demselben Modell:

- **MOTIF-Zeitachse** — Dauer in Frames, Ease-Kurve, gerichteter Ablauf. Dieselbe Maschine wie
  die Transitions.
- **Loop** — alle Parameter periodisch. **Rauschen wird über einen geschlossenen Kreis im
  Rauschraum abgetastet, nicht entlang der Zeitachse.** Sonst kehrt es nie zurück und die Schleife
  bricht sichtbar. Nachträglich eingezogen hieße, jeden bewegten Parameter noch einmal anzufassen.
- **Stagger** — Zeitversatz pro Ring- oder Kopienindex. Kleiner Zusatz, große Wirkung: daraus
  entsteht das Wellengefühl, das in Bild 3 und 5 schon als Standbild angelegt ist.

## 7 Ausgänge

| Ausgang | Weg | Grenze |
|---|---|---|
| MP4 | bestehender WebCodecs-Export mit Selbstprüfung | — |
| Alpha-WebM | derselbe Weg, anderer Codec | setzt voraus, dass WebCodecs hier VP9 mit Alphakanal schreibt — **vor Stufe 1 nachweisen**, nicht annehmen |
| Maske für Transitions | das Feld **ist** eine Graustufenmaske | keine Zusatzarbeit |
| SVG | Marching Squares auf demselben Feld | **ohne Korn, Halbton, Glow** |

**Die SVG-Ausgabe ist enger, als sie klingt.** Ein farbiges Band ist nicht eine Isolinie, sondern
die **Fläche zwischen zweien** — also ein Pfad mit Loch, mit korrekter Umlaufrichtung und
Even-Odd-Füllung. Und Korn, Halbton und Glow sind Rastereffekte und können nicht mit. Die
Vektorfassung ist die flache Fassung. Das ist eine bewusste Grenze, keine Lücke.

## 8 MOTIF v0.2

Die Sprache kennt heute genau einen `transition`-Block mit flachen Zuweisungen. Ein Feldgraph
braucht **verschachtelte Blöcke und mehrere Knoten pro Datei**.

Das bricht den Feature-Freeze für v0.1, der nach M3 im Briefing festgeschrieben wurde. Die dort
verlangte Begründung — zwei reale Anwendungsfälle — ist erfüllt: der Feldgraph und die spätere
Verkettung mehrerer Transitions.

**Bedingung:** Bestehende v0.1-Dateien müssen weiter lesbar bleiben, abgesichert durch die
vorhandenen Roundtrip-Tests.

## 9 Testen

`field-core` bekommt Unit-Tests wie `grade-core`:

- Abstandsfunktionen gegen bekannte Werte (Superellipse mit Exponent 1, 2, 4 gegen Raute, Kreis, Squircle)
- Ringprofil: Abstandskurve, Härte, Trennlinienbreite
- Repeater: Kopienzahl, Transform-Delta, Indexvergabe
- Isolinien: geschlossene Pfade, korrekte Umlaufrichtung, Löcher

Dazu zwei Prüfungen, die das Eigentliche absichern:

- **GLSL gegen TS-Referenz** über Golden Frames. Weichen sie ab, ist die eine Fassung falsch.
- **Loop-Test**: Frame 0 gegen Frame N. Bricht die Schleife, fällt der Test.

## 10 Stufen

| Stufe | Inhalt | Deckt ab |
|---|---|---|
| 1 | Formen (Superellipse mit Exponent, Kapsel, Ring), Vereinigung, smooth-min und Spiegelung, Ringprofil mit Härte und Trennlinie, Lab-Palette mit Presets (ohne „Stapel"), Glow, Loop, Stagger, Vorschau, MP4 | Bild 1, 4, 5 |
| 2 | Repeater | Bild 3 |
| 3 | Raster als Form (Punkt, Block, Dither) und Korn | Bild 7, 8 |
| 4 | Pfade mit exakter Vereinigung und verjüngtem Radius | Bild 2, 6 |
| 5 | SVG, Kopplung an die Transitions, Audio-Reaktion | — |

Die Pfade stehen auf Stufe 4 statt am Ende, weil zwei der acht Vorlagen ohne sie nicht existieren.

## 11 Nicht-Ziele

- Kein 3D
- Kein allgemeiner Node-Editor für beliebige Bildverarbeitung
- Kein Bild- oder SVG-Import (vom Nutzer abgewählt)
- Keine Vektor-Boolesche-Bibliothek — verknüpft wird im Feld, nicht in Pfaden
- Keine Standbild-/Poster-Ausgabe in hoher Auflösung (abgewählt)

## 12 Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Shader-Übersetzung im Bedienweg | Werte als Uniforms, Neuübersetzung nur bei Strukturänderung (§4) |
| Uniform-Kapazität von WebGL2 | Obergrenze 16 Formen, früh gemessen |
| TS-Referenz und GLSL driften auseinander | Golden-Frame-Vergleich beider Fassungen, ab Stufe 1 |
| Loop bricht wegen Rauschen | Kreisabtastung von Anfang an, Loop-Test in CI |
| Marching Squares liefert grobe Pfade | Feld höher abtasten als die Anzeige, Bézier-Anpassung mit Toleranz; Stufe 5, also spät genug für eine eigene Bewertung |
| Umfang: die Säule ist so groß wie die Transitions | Stufen sind einzeln vorführbar; nach Stufe 1 kann bewertet werden, ob es weitergeht |

## 13 Offene Punkte

- Ob die Kapsel-Kombination für Bild 2 nicht doch reicht, entscheidet sich an echter Arbeit in
  Stufe 1 bis 3. Fällt es dort weg, spart Stufe 4 den größten Brocken.
- Die Farbwerte der Presets sind aus den Bildern **geschätzt**, nicht gemessen. Vor Stufe 1
  sollten sie an den Originaldateien abgenommen werden.
