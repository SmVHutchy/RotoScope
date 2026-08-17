# RotoScope Studio — Hyper Project Prompt

> **Was das hier ist:** Das Master-Briefing für das Projekt. Kein Marketing, kein Pitch — die
> Quelle der Wahrheit für Architektur, Scope, Sprache, Use-Cases, Bausteine und Reihenfolge.
> Ganz unten (`§13`) steht der eigentliche Copy-Paste-Prompt für den Coding-Agent.
>
> Recherchestand: **August 2026.**

---

## 0. Ausgangslage & Annahmen

| Quelle | Status |
|---|---|
| [Zarxrax/Sammie-Roto-2](https://github.com/Zarxrax/Sammie-Roto-2) | Geprüft. Python 3.12 + UV, Desktop-App, v2.3.3 (April 2026). Modelle: SAM2, EfficientTAM (Segmentierung), MatAnyone / MatAnyone2 / VideoMaMa (Matting), MiniMax-Remover (Object Removal). Lizenz **GPL-3.0**. Live-Preview, In/Out-Marker, Half-Precision, Punkt-Korrektur ohne Tracking-Verlust. |

### 0.1 Festgelegter Rahmen

| Frage | Antwort | Konsequenz |
|---|---|---|
| **Zielhardware** | **AMD Radeon RX 7600 XT**, 16 GB VRAM (Navi 33, gfx1102), Windows 11 | **Kein CUDA, kein TensorRT.** Das gesamte Inferenz-Kapitel läuft über ROCm/DirectML — siehe §4.5, komplett neu geschrieben. Reichlich VRAM, aber begrenzte Rechenleistung: **Compute ist der Engpass, nicht Speicher.** |
| **Kommerzieller Rahmen** | Erstmal privat, Option auf später offenhalten | Bauen mit sauberer Lizenzhygiene (`docs/licenses/` ab M1), aber Lizenzfragen blockieren M1 nicht. GPL-Code bleibt trotzdem draußen — sonst ist die Tür später zu. |
| **Ausgabewege** | After Effects **und** Nuke/Fusion **und** Resolve **und** Web/Client-Delivery | Bestätigt die MIR-First-Architektur: kein DCC-spezifisches Datenmodell. Aber vier Brücken in v1 sind unrealistisch — Reihenfolge in §4.6. |
| **Baureihenfolge** | Roto zuerst (M1–M2), wie geplant | Bewusste Entscheidung für den technisch schwersten Teil zuerst. Auf AMD-Hardware heißt das: **erst ein Hardware-Spike, dann M1-Scope festlegen** (§10, M0). |

**Lizenz-Warnung, früh und laut:** Sammie-Roto 2 ist GPL-3.0. Wer Code daraus kopiert, macht das
eigene Tool GPL-3.0. Der saubere Weg: **die Modelle direkt einbinden**, nicht Sammies Code.
Dasselbe gilt für `color-matcher` (§4). Vor jedem Modell-/Lib-Bundle: Lizenz in
`docs/licenses/<name>.md` dokumentieren, sonst wird das Tool später unverkäuflich.

---

## 1. Nordstern

> Ein lokales Werkzeug, das aus Footage **editierbare Masken**, **komponierbare Transitions** und
> **übertragbare Farbwelten** macht — jeder Parameter offen, nichts als Blackbox-Preset,
> und alles was im Browser getweakt wird, landet 1:1 in After Effects.

Drei Dinge, die zusammengehören, weil sie denselben Datenfluss teilen (Frame → Alpha → Farbe → Zeit):

1. **Roto-Engine** — KI-Masken, aber mit menschlicher Korrektur und Bezier-Export.
2. **Motion/Transition-Engine** — eine Library moderner Übergänge, gebaut wie Frontend-Motion
   (GSAP-Denke: Timeline, Ease, Stagger, Physik), nicht wie AE-Presets.
3. **Grade-Transfer** — Farbraum/„Vibe" aus Referenzbildern extrahieren und auf eigenes Material legen.

Der Klebstoff: **MOTIF**, eine kleine deklarative Sprache + ein Web-Config-Tool, in dem jeder
Parameter live sichtbar, tweakbar und *approvebar* ist.

---

## 2. Use-Case-Katalog

Nummeriert, damit man sie in Issues referenzieren kann. `[M#]` = Milestone aus §10.

### A — Rotoscoping / Masking

- **UC-A1 [M1]** Subjekt aus Clip freistellen: Klick-Prompt → Maske → Propagation über N Frames.
- **UC-A2 [M1]** Mehrere Objekte gleichzeitig tracken, jedes mit eigener ID und eigenem Alpha-Kanal.
- **UC-A3 [M1]** Korrektur-Workflow: Punkt/Box auf Frame 47 hinzufügen, **ohne** dass Tracking von 1–46 verloren geht.
- **UC-A4 [M2]** Kanten-Refinement per Matting (Haare, Motion Blur, Halbtransparenz) auf die Maske.
- **UC-A5 [M2]** **Raster-Maske → editierbare Bezier-Splines** mit temporal stabilen Punkt-IDs.
  *Das ist das Killer-Feature.* KI liefert Pixel, der Nutzer bekommt Kurven, die er in AE anfassen kann.
- **UC-A6 [M2]** Export: PNG/EXR-Alpha-Sequenz, ProRes 4444, WebM-Alpha, SVG, AE-`.jsx` mit Mask-Keyframes.
- **UC-A7 [M3]** Object Removal / Clean-Plate: Maske invertieren, Inpainting über die Sequenz.
- **UC-A8 [M3]** Maske als **Treiber** für Motion: Alpha eines getrackten Objekts steuert Transition-Parameter (z. B. Wipe folgt der Silhouette).
- **UC-A9 [M4]** Batch: Ordner mit 40 Clips, ein Prompt-Schema, headless durchrechnen.
- **UC-A10 [M4]** Garbage-Matte / ROI: nur Bildbereich X rechnen → VRAM und Zeit sparen.
- **UC-A11 [M1]** **Text-Prompt-Roto:** „alle Personen mit rotem Mantel" → SAM 3 segmentiert und trackt
  jede Instanz. Für ein Studio der größte Zeitgewinn im ganzen Tool.
- **UC-A12 [M3]** **Tiefen-Matte:** Depth-Map pro Frame → Maske nach Entfernung (Vorder-/Hintergrund trennen,
  ohne irgendetwas anzuklicken).
- **UC-A13 [M4]** **Shape-Export in die Studio-Pipeline:** dieselben Splines nach Nuke (Roto-Node),
  Silhouette (`.ssf`), Mocha und Alembic. Wer nur nach AE exportiert, baut ein Solo-Tool — kein Studio-Tool.

### B — Transitions / Motion

- **UC-B1 [M3]** Start-Frame + End-Frame + Übergangstyp wählen → Transition wird **gebaut**, nicht aus Preset geladen.
- **UC-B2 [M3]** Transition-Library: moderne Übergänge (Liquid/Displacement-Wipe, Glitch/Datamosh-Style, Zoom-Blur-Punch, Card-Flip, Morph-Cut, Mask-Reveal, Text-Kinetics).
- **UC-B3 [M3]** Motion-Vokabular aus dem Frontend: Timeline, Label, Stagger, Ease-Kurven, **Spring/Physik**, Scrub-Preview.
- **UC-B4 [M3]** Transition als **Skript** ausführbar — headless auf Clip-Paar anwenden, ohne UI.
- **UC-B5 [M4]** Ausgabe nach AE: entweder als **echte Layer/Effekte** (editierbar) oder — wo AE-Scripting nicht reicht — als **gebackene Alpha-Sequenz + Precomp**.
- **UC-B6 [M4]** Transition-Komposition: zwei Transitions überlagern/verketten, Parameter voneinander ableiten.
- **UC-B7 [M5]** Reaktive Transitions: Parameter an Audio-Onsets, Beat-Grid oder Maskendaten binden.
- **UC-B8 [M5]** Web-Export: dieselbe Transition als echtes GSAP/WebGL-Snippet für eine Website ausgeben.
- **UC-B9 [M3]** **gl-transitions importieren:** die ~80 MIT-lizenzierten GLSL-Transitions als MOTIF-Nodes
  einlesen, ihre `uniform`-Parameter automatisch in den Inspector heben. Startbibliothek an Tag 1.
- **UC-B10 [M4]** **Parallax-/Tiefen-Transition:** Depth-Map als Displacement → 2.5D-Kamerafahrt aus einem
  einzelnen Frame. Sieht teuer aus, kostet nichts.

### C — Sprache & Config-Tool

- **UC-C1 [M3]** Jeder Parameter jedes Nodes ist im Web-Inspector sichtbar und live tweakbar — **keine versteckten Konstanten**.
- **UC-C2 [M3]** „Approve": aktueller Parametersatz wird als versionierter, gehashter Snapshot festgeschrieben.
  **Presets sind hier nur signierte Snapshots** — immer aufklappbar, nie Blackbox.
- **UC-C3 [M3]** `.motif`-Datei ist menschenlesbar, diffbar, git-fähig. Text ↔ UI sind bidirektional.
- **UC-C4 [M4]** Ein `.motif` rendert deterministisch in **drei** Targets: Web, AE, Headless — gleiches Ergebnis.
- **UC-C5 [M4]** A/B-Vergleich zweier Snapshots am selben Frame, Split-Screen + Differenz.
- **UC-C6 [M5]** Eigene Nodes/Funktionen in der Sprache definieren (`def wipe(...)`) und in die Library legen.

### D — Farbe / Look-Transfer

- **UC-D1 [M2]** Referenzbild rein → Palette, Kontrastkurve, Split-Tone, Sättigung-über-Luma extrahieren.
- **UC-D2 [M2]** Look auf eigenes Material anwenden, mit **Mix-Regler** (0–100 %) statt Alles-oder-Nichts.
- **UC-D3 [M2]** Export als 33³ `.cube` LUT → funktioniert in AE (Lumetri), Resolve, Premiere, OBS.
- **UC-D4 [M3]** Look nur auf Maskenbereich anwenden (Subjekt warm, Hintergrund kalt) — Kopplung zu UC-A1.
- **UC-D5 [M3]** Mehrere Referenzen mischen: 60 % Ref-A + 40 % Ref-B, ergibt einen neuen Look.
- **UC-D6 [M4]** Look-Konsistenz über eine Sequenz: Drift/Flicker zwischen Frames erkennen und dämpfen.
- **UC-D7 [M4]** Look als Node **in** einer Transition — Farbe verschiebt sich während des Übergangs.

### E — Betrieb / Pipeline

- **UC-E1 [M1]** Alles lokal, offline lauffähig. Kein Cloud-Zwang, keine Telemetrie.
- **UC-E2 [M1]** Projekt = Ordner mit Manifest; Löschen des Ordners = restlos deinstalliert (Sammie-Prinzip).
- **UC-E3 [M4]** CLI `rotoc` für alles, was die GUI kann → CI, Batch, Renderfarm.
- **UC-E4 [M5]** Watch-Folder: neues Footage rein → Roto + Grade + Transition automatisch nach Rezept.
- **UC-E5 [M5]** AE-Panel: Auswahl in AE markieren → an RotoScope schicken → Ergebnis kommt als Precomp zurück.
- **UC-E6 [M5]** **Editorial-Anbindung:** Schnittliste als OpenTimelineIO lesen → Transitions an den echten
  Schnittpunkten anwenden, statt Clips manuell zu paaren. Alpha-Ausgabe optional als Cryptomatte-EXR,
  damit Compositing-Kollegen im Nachhinein noch trennen können.
- **UC-E7 [M1]** **Interaktive Latenz auf AMD-Hardware:** Klick-Korrektur unter **250 ms** auf
  Proxy-Auflösung, Scrub durch gerechnete Frames unter 33 ms (Cache), schwere Arbeit im Hintergrund.
  Explizites Produktziel mit gemessenen Budgets, kein Nice-to-have — Zahlen und Begründung in §4.5.

---

## 3. Produkt-Prinzipien

1. **Parameter-First, Preset-Last.** Ein Preset ist ein approvter, aufklappbarer Snapshot — nie eine Kiste mit drei Reglern.
2. **Determinismus.** Gleiches `.motif` + gleicher Seed + gleicher Input = bit-identisches Ergebnis. Zufall existiert nur über explizite Seeds.
3. **Editierbarkeit schlägt Automatik.** Die KI liefert einen Vorschlag; der Nutzer bekommt immer die editierbare Repräsentation (Splines, Kurven, Zahlen).
4. **Ein Modell, drei Renderer.** Web, AE und Headless lesen dieselbe IR. Ein Target darf ein Feature nicht heimlich anders interpretieren — nur explizit *nicht können* (und das laut sagen).
5. **Lokal & offline.** GPU im Haus, keine Uploads.
6. **Text ist das Format.** UI schreibt Text, Text füttert UI. Alles diffbar.

---

## 4. Bausteine — recherchierte Repos (Stand August 2026)

Nichts hiervon wird geforkt oder kopiert. Es wird **eingebunden** oder als **Referenz** gelesen.
Die Lizenzspalte entscheidet, welches von beidem.

### 4.1 Roto & Masken

| Rolle | Repo | Warum genau das | Lizenz |
|---|---|---|---|
| **Segmentierung (primär)** | [facebookresearch/sam3](https://github.com/facebookresearch/sam3) | **SAM 3** (Nov 2025, ICLR 2026): *Promptable Concept Segmentation* — Text- und Bild-Exemplar-Prompts, findet und trackt **alle Instanzen** eines Konzepts in Video. Der Video-Tracker ist der SAM-2-Decoder, fest an den neuen Detector gekoppelt. Genau das macht UC-A11 möglich. | Meta-eigene Lizenz — **vor Bundling zwingend prüfen**, nicht Apache annehmen |
| **Segmentierung (interaktiv)** | [facebookresearch/sam2](https://github.com/facebookresearch/sam2) | Apache-2.0, bewährt, breitester ONNX-Export-Support. **Auf der Zielhardware (§0.1) der Arbeitspferd-Pfad für alles Interaktive**, während SAM 3 den Text-Prompt-Pass im Hintergrund fährt. | Apache-2.0 |
| Segmentierung (leicht) | EfficientTAM | Deutlich günstiger in Rechenzeit und VRAM. Auf einer RX 7600 XT nicht die Notlösung, sondern ernsthafter Kandidat für den Proxy-Pfad. | prüfen |
| **Matting** | [pq-yang/MatAnyone2](https://github.com/pq-yang/MatAnyone2) | **CVPR 2026 Highlight.** Bringt einen *Matting Quality Evaluator* mit — bewertet die eigene Matte-Qualität ohne Ground Truth. Damit kann das Tool dem Nutzer sagen „Frame 88 ist schlecht, schau da hin" statt still Mist zu liefern. Enormer UX-Hebel. | Modell-Lizenz prüfen (kommerzielle Nutzung fraglich) |
| Matting (Vorgänger) | [pq-yang/MatAnyone](https://github.com/pq-yang/MatAnyone) | CVPR 2025, stabil, baut auf *Cutie* auf. Fallback. | Modell-Lizenz prüfen |
| **Punkt-Tracking** | [facebookresearch/co-tracker](https://github.com/facebookresearch/co-tracker) | **CoTracker3.** Der fehlende Baustein für UC-A5: Bezier-Kontrollpunkte brauchen über Frames hinweg **stabile Identitäten**. Nicht raten — die Punkte tracken lassen und die Kurve daran hängen. Löst das Risiko „instabile Punkt-IDs" fast komplett. | prüfen (Meta) |
| Tiefe | Video Depth Anything / DepthCrafter | Temporal konsistente Depth-Maps → UC-A12 (Tiefen-Matte) und UC-B10 (Parallax-Transition). | prüfen |
| **Object Removal** | [sczhou/ProPainter](https://github.com/sczhou/ProPainter) | ICCV 2023, schnell, geringe VRAM-Last, breit erprobt. **Auf der Zielhardware der realistische Pfad** — siehe Zeile darunter. | S-Lab / non-commercial prüfen |
| Object Removal (Qualität) | [lixiaowen-xw/DiffuEraser](https://github.com/lixiaowen-xw/DiffuEraser) | Diffusionsbasiert, schlägt ProPainter bei Vollständigkeit und temporaler Konsistenz. **Aber: Diffusion pro Frame auf einer RX 7600 XT ist Nacht-Batch-Territorium, keine Interaktion.** Deshalb Qualitätsstufe, nicht Default — und UC-A7 ist der Kandidat, den man streicht, wenn der M0-Spike schlecht ausgeht. | prüfen |

### 4.2 Motion & Transitions

| Rolle | Repo | Warum genau das | Lizenz |
|---|---|---|---|
| **Transition-Startbibliothek** | [gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions) | ~80 GLSL-Transitions in einem einheitlichen Vertrag: `transition(vec2 uv) -> vec4`, mit deklarierten Parametern. **Das ist bereits ein Transition-IR** — MOTIF muss es nur wrappen. Spart Monate. | MIT |
| Headless-Rendering derselben Shader | [scriptituk/xfade-easing](https://github.com/scriptituk/xfade-easing) | Portiert gl-transitions + CSS-Easings nach FFmpeg `xfade`. Für den Headless-Pfad ohne eigenen GPU-Renderer. | prüfen |
| Headless-Rendering (Alternative) | [transitive-bullshit/ffmpeg-gl-transition](https://github.com/transitive-bullshit/ffmpeg-gl-transition) | FFmpeg-Filter, der GLSL-Transitions direkt fährt. | prüfen |
| **Zeit-Engine** | [GSAP](https://gsap.com/) | Seit April 2025 **100 % kostenlos inkl. aller früheren Club-Plugins** (SplitText, MorphSVG, DrawSVG, ScrollTrigger) — auch kommerziell. Framework-agnostisch, ~23 KB. Treibt bei uns Zeit, nicht Pixel. | frei, kommerziell erlaubt |
| Sprach-Präzedenzfall | [Motion Canvas](https://motioncanvas.io/) | Animation als TypeScript-Generatorfunktionen + Scene-Graph. **MIT.** Vor dem MOTIF-Design lesen: die haben die „Animation als Code"-Ergonomie schon einmal durchgedacht. | MIT |
| Batch-Video-Renderer | Revideo (Motion-Canvas-Fork) | MIT, selbst-gehostetes Node-Rendering ohne Lizenz-Overhead. Kandidat für den Headless-Pfad. | MIT |
| **Nicht** ohne Nachdenken | Remotion | Technisch das reifste Tool — aber ab **1 Mio. $ Firmenumsatz kostenpflichtig**. Für ein Studio ein echtes Kostenrisiko. Bewusste Entscheidung nötig. | kommerzielle Lizenz ab Schwelle |
| Timeline-UI-Präzedenz | Theatre.js | Visueller Animations-Editor mit Studio-UI über Code-definierten Objekten — genau die „Config-Tool über Sprache"-Idee. Als Vorbild lesen. | Apache-2.0 |
| Vektor-Export | [airbnb/lottie-web](https://github.com/airbnb/lottie-web) + Bodymovin | Optionales viertes Emit-Target: Transition als Lottie an Kunden/Web ausliefern. Nur für vektorfähige Transitions. | MIT |

### 4.3 Farbe

| Rolle | Repo | Warum genau das | Lizenz |
|---|---|---|---|
| **Algorithmus-Referenz** | [hahnec/color-matcher](https://github.com/hahnec/color-matcher) | Implementiert **Reinhard**, **Monge-Kantorovich-Linearisierung (MKL)** und **HM-MVGD-HM** (Histogram-Matching + multivariate Gauß) — inkl. Bildsequenz-Support. Genau die Verfahren aus §8. | **GPL-3.0 → nicht linken.** Als Referenz lesen, die Verfahren in `grade-core` selbst implementieren (je ~100 Zeilen Lineare Algebra). |
| **Farb-Pipeline** | [AcademySoftwareFoundation/OpenColorIO](https://github.com/AcademySoftwareFoundation/OpenColorIO) + [OpenColorIO-Config-ACES](https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES) | Der Industriestandard. Wenn das Tool in einem Studio neben Resolve und Nuke stehen soll, muss es dieselben Transforms sprechen — sonst ist es ein Spielzeug. | BSD-3 |
| Farbwissenschaft | `colour-science/colour` | Referenz-Implementierungen für Farbräume, Chromatic Adaptation, LUT-I/O. Zum Verifizieren der eigenen Mathematik. | BSD-3 |

### 4.4 App-Gerüst

| Rolle | Repo | Warum genau das | Lizenz |
|---|---|---|---|
| **Parameter-Inspector** | [cocopon/tweakpane](https://github.com/cocopon/tweakpane) (+ `react-tweakpane`) | Der Standard für „jeder Parameter live". Dependency-frei, erweiterbar, eigene Blades möglich — nötig für Kurven-Editoren und Unit-Anzeige. **UC-C1 ist damit fast fertig.** | MIT |
| Node-Graph-UI | [xyflow / React Flow](https://reactflow.dev/) | Ausgereift, erweiterbar, gebaut für genau solche Editoren. Kein eigener Graph-Editor. | MIT |
| **Media-I/O im Browser** | [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) | Reines TypeScript, zero-dependency, hardware-beschleunigt über WebCodecs, mikrosekundengenaues Editing, >25 Codecs. Löst Preview-Playback und Web-Export, ohne ffmpeg.wasm (das keine GPU nutzt). | vor Bundling prüfen |
| Desktop-Shell | Tauri 2 | Web-UI bleibt Web-UI, aber Dateizugriff und Prozessstart sind sauber. | MIT/Apache |
| Audio-Analyse | Essentia.js (Web) / aubio (Python) | Für UC-B7: Beat-, Onset- und Transienten-Erkennung. **aubio ist echtzeitfähig**, Essentias `RhythmExtractor` arbeitet über den ganzen Track — also aubio fürs Live-Scrubbing, Essentia für die präzise Offline-Beat-Map. | aubio GPL-3.0 → **prüfen / Essentia bevorzugen** |

### 4.5 Performance & Deployment auf AMD/Windows — das Kapitel, das über das Projekt entscheidet

**Ausgangslage:** RX 7600 XT, Windows 11. Alle beeindruckenden Zahlen zu SAM-3-Inferenz
(~24 ms/Frame) stammen aus **FP16-TensorRT auf NVIDIA-Datacenter-GPUs** und sind für diese Hardware
schlicht nicht erreichbar. Wer sie trotzdem in den Plan schreibt, plant an der Realität vorbei.
Also: reale Optionen, reale Erwartungen.

| Pfad | Stand August 2026 | Bewertung für dieses Projekt |
|---|---|---|
| **PyTorch + ROCm (Windows-nativ)** | ROCm 7 gilt inzwischen als First-Class-PyTorch-Backend. AMD liefert `cp312`-Wheels für RDNA 3/4 unter Windows 11; gfx1102 (Navi 33) ist abgedeckt. | **Primärer Pfad — am 2026-08-16 bestätigt** (§4.5.1). Installation lief durch, Karte wird gesehen, Werte im Zielkorridor. |
| PyTorch + ROCm unter Linux/WSL2 | Deutlich ausgereifter als Windows-nativ; „für das volle Erlebnis braucht man Linux". Performance-Abstand zu CUDA auf vergleichbarer Klasse ~15–25 %. | **Rückfallebene**, falls Windows-nativ zickt. Kostet einen Dual-Boot oder WSL2-Setup — und WSL2-ROCm ist selbst nicht für alle Karten freigegeben. Der Spike in M0 entscheidet das, nicht die Vermutung. |
| **ONNX Runtime + DirectML EP** | Vendor-neutral über DirectX 12, läuft auf jeder DX12-GPU. AMD investiert 2026 sichtbar in Windows ML und den ONNX-Runtime-GPU-EP; neues Plugin-Interface trennt GPU-Backend vom Runtime-Kern. | **Zweiter Pfad, nicht optional.** Robuster und einfacher auszuliefern als ROCm. Haken: das Modell muss sauber nach ONNX exportierbar sein — beim SAM-Bild-Encoder unproblematisch, beim Video-Memory-Attention und bei MatAnyone/CoTracker **vorher verifizieren**. |
| ZLUDA / CUDA-Emulation | Existiert, ist aber instabil und rechtlich unsauber. | **Nicht einplanen.** |

**Was das architektonisch bedeutet — drei Konsequenzen:**

1. **Das Backend-Interface ist keine Kür mehr, sondern die Voraussetzung.** `PyTorch-ROCm | ONNX-DirectML | PyTorch-CUDA`
   hinter *einem* Interface, ab M1. Auf dieser Hardware wird real zwischen Pfaden gewechselt werden
   müssen — und wer später auf eine NVIDIA-Karte umsteigt, bekommt den schnellen Pfad geschenkt.
2. **Zweistufige Qualität statt eines Modells.** Interaktives Arbeiten läuft auf **Proxy-Auflösung
   mit dem leichtesten Modell** (EfficientTAM / SAM 2), volle Auflösung mit dem besten Modell läuft
   **im Hintergrund**, während weitergearbeitet wird. Das ist auf schwacher Hardware kein Kompromiss,
   sondern die einzige Bauweise, die sich flüssig anfühlt.
3. **SAM 3 wird zum Einmal-Pass, nicht zum Interaktionsmodell.** Der Text-Prompt („alle Autos") läuft
   einmal als Hintergrundjob und darf Sekunden brauchen. Danach übernimmt der leichte Tracker für
   Korrekturen. Damit bleibt UC-A11 erhalten, ohne die Interaktivität zu opfern.

**Revidiertes Latenzziel (ersetzt die frühere <100-ms-Ansage):**

| Interaktion | Budget | Bemerkung |
|---|---|---|
| Klick-Korrektur, Proxy (≤960 px lange Kante) | **< 250 ms** | Die Schwelle, ab der sich Arbeiten noch wie Direktmanipulation anfühlt |
| Scrub durch bereits gerechnete Frames | **< 33 ms** | Reine Cache-Wiedergabe, keine Inferenz — Aufgabe des Frame-Caches |
| Propagation über 100 Frames, Proxy | **< 60 s** | Als Hintergrundjob mit Fortschrittsanzeige, blockiert nichts |
| Volle Auflösung + Matting | Batch | Läuft im Hintergrund, Ergebnis ersetzt die Proxy-Version im Cache |

### 4.5.1 Gemessen am 2026-08-16 — der Spike ist gelaufen

Pfad A steht: `torch 2.9.1+rocm7.2.1`, HIP 7.2, die Karte wird gesehen. Vollständige Werte und
Herleitung in [`docs/decisions/001-inferenz-backend.md`](docs/decisions/001-inferenz-backend.md).

| Last (fp16, Median) | proxy-960 | full-1920 |
|---|---|---|
| Conv-Stack (Kernel-Pipeline) | 2,2 ms | 7,4 ms |
| **ViT-B-Encoder (die relevante Zahl)** | **79,9 ms** → **56,2 ms** mit AOTriton | 705,6 ms → 460,8 ms |
| VRAM-Spitze | 1,84 GB → **0,36 GB** mit AOTriton | von 16 GB |

**Drei Schlüsse:**

1. **Volle Auflösung ist Hintergrundarbeit** — 460–705 ms/Frame. Genau so geplant, jetzt belegt.
2. **VRAM ist gegenstandslos.** Unter 2 GB von 16. Das Risiko „Modelle sequenziell laden" aus §11
   ist für diese Karte erledigt; der Engpass ist ausschließlich Rechenzeit.
3. ~~Der Proxy-Pfad trägt, 56–80 ms für eine SAM-2-ähnliche Encoder-Last.~~ **Diese Hochrechnung
   war falsch** — die echte Messung steht in §4.5.2.

### 4.5.2 Echte SAM-2-Messung — und eine Korrektur

`sam2.1_hiera_tiny` auf der RX 7600 XT, Eingang 960×544
([ADR 002](docs/decisions/002-sam2-variante-und-frame-cache.md)):

| | tiny | small | base_plus |
|---|---|---|---|
| `set_image` (Encoder, 1× pro Frame) | **280 ms** | 343 ms | 585 ms |
| `predict` (pro Klick, gecacht) | **11,2 ms** | 11,4 ms | 11,4 ms |

**Die synthetische Klammer aus §4.5.1 lag um Faktor vier daneben.** Grund: SAM 2 skaliert jedes
Bild intern auf **1024×1024** — 4096 Tokens statt der angenommenen 2040, und Attention ist
quadratisch. Daraus folgt direkt:

> **Eine niedrigere Proxy-Auflösung macht den SAM-2-Encoder nicht schneller.**
> Sie hilft bei Decode, Matting, Kanten, IO und Anzeige — dort bleibt sie richtig. Der einzige
> Hebel am Encoder ist die Modellgröße und der Cache.

Die Architektur trägt trotzdem, aber aus einem anderen Grund als gedacht: **Encoder und Decoder
sind getrennt.** Der Encoder läuft einmal pro Frame und ist cachebar, der Klick läuft in 11 ms auf
dem Cache — Faktor 20 unter dem 250-ms-Budget. **Damit ist der Frame-Cache kein
Performance-Feature, sondern die tragende Konstruktion des interaktiven Arbeitens.** Er wird in
M1 gebaut, zusammen mit Prefetch der Nachbarframes, der den einmaligen 280-ms-Einstieg unsichtbar
macht.

**Fund am Rande, aber mit Hebel:** PyTorch schaltet Flash- und Memory-Efficient-Attention auf AMD
standardmäßig ab (»still experimental«). Mit `TORCH_ROCM_AOTRITON_ENABLE_EXPERIMENTAL=1` fallen
**30 % Latenz und 80 % VRAM** weg. Die Engine setzt die Variable — aber M1 schuldet einen
Korrektheitsvergleich der Maskenausgabe mit und ohne, bevor das ein Default bleibt.

Die gute Nachricht bleibt: **die Transition- und Grade-Seite ist von alldem nicht betroffen.**
WebGPU läuft auf der 7600 XT problemlos, GLSL-Shader sind für diese Karte Kinderkram. Der Schmerz
sitzt ausschließlich im ML-Teil — und er ist kleiner als befürchtet.

### 4.6 Pipeline & Interchange — was ein Studio-Tool von einem Solo-Tool trennt

Alle vier Ausgabewege sind gesetzt (§0.1) — aber nicht gleichzeitig baubar. **Reihenfolge nach
Aufwand-pro-Nutzen:**

1. **Neutraler Kern zuerst (M2):** EXR/PNG-Alpha-Sequenz, `.cube` LUT, SVG + Shape-JSON. Das ist
   kein DCC-Bridge-Code, sondern schlicht korrektes Dateischreiben — und deckt Resolve bereits
   vollständig ab (LUT + Alpha ist alles, was Resolve von diesem Tool je braucht).
2. **After Effects (M4):** teuerster Pfad (CEP + ExtendScript, Layer-Emit), aber dein Hauptwerkzeug.
3. **Nuke/Fusion (M4):** Roto-Node-Script und `.ssf` sind reine Textformate — billig, *sobald* das
   Spline-Datenmodell aus M2 sauber ist. Deshalb muss M2 die Splines DCC-neutral modellieren.
4. **Web/Client-Delivery (M5):** fällt aus dem Headless-Renderer und dem GSAP-Export fast heraus.

| Rolle | Baustein | Warum |
|---|---|---|
| **Shape-Interchange** | Mocha-/Silhouette-Formate (`.ssf`), Nuke-Roto, Alembic | Mocha Pro exportiert Shapes und Tracking nach Nuke, Silhouette, Alembic und Mistika — das ist der De-facto-Erwartungshorizont. Splines, die nur in AE landen, sind für die Compositing-Abteilung wertlos. → UC-A13 |
| Editorial | [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) | ASWF-Standard, C++-Kern, Adapter in Python. Liest Schnittlisten aus Resolve/Premiere/Avid → Transitions landen an den echten Cuts. → UC-E6 |
| Asset-Auflösung | [OpenAssetIO](https://github.com/OpenAssetIO/OpenAssetIO) | Stabile Asset-Identitäten statt Dateipfad-Konventionen. Erst relevant, wenn das Tool in einem Haus mit Asset-Management steht — aber die Schnittstelle nicht verbauen. |
| Matte-Transport | Cryptomatte (in OpenEXR) | Alle Matte-Informationen in einem Render. Der Kollege im Compositing kann Objekte nachträglich isolieren, ohne dass du neu rechnest. → UC-E6 |

### 4.7 Die Erkenntnisse aus der Recherche, die den Plan verändern

1. **SAM 3 verschiebt den Einstieg.** Text-Prompt-Segmentierung über alle Instanzen bedeutet: der
   erste Schritt im Tool ist ein Textfeld, nicht ein Klick. Für Studio-Arbeit („alle Autos maskieren")
   ist das der Unterschied zwischen Feature und Werkzeug. → UC-A11 wandert in **M1**.
   *Auf der Zielhardware läuft dieser Pass im Hintergrund und darf Sekunden brauchen (§4.5) —
   das nimmt ihm nichts von seinem Wert, weil man ihn einmal pro Shot anstößt, nicht einmal pro Klick.*
2. **CoTracker3 löst das größte technische Risiko.** Die Raster→Bezier-Konvertierung mit stabilen
   Punkt-IDs war der wackligste Teil des Plans. Punkte tracken lassen und die Kurve daran binden
   ist ein gelöstes Problem statt eigener Forschung.
3. **gl-transitions ist bereits eine IR.** Der Vertrag `transition(uv) -> vec4` mit deklarierten
   Uniforms ist praktisch das, was MOTIF als Node-Signatur braucht. MOTIF wird zur *Zeit- und
   Kompositionsschicht darüber* — nicht zu einem weiteren Shader-Format. Das ist deutlich weniger
   Arbeit und sofort mit einer echten Library bestückt.
4. **UXP für After Effects gibt es nicht — Korrektur einer Fehlannahme.** Stand April 2026 sind
   UXP-Panels in AE **nicht verfügbar**; AE läuft weiter auf **CEP + ExtendScript**, C++-AEGP für
   tiefere Integration. UXP ist die erklärte Zukunft, aber nicht produktionsreif. Die frühere
   Empfehlung „UXP" in §12 war falsch und ist korrigiert. Konsequenz: Panel als **CEP-HTML-Panel**
   (dieselbe Web-Codebasis wie `studio-web`), Comp-Manipulation über ExtendScript, Migrationspfad
   nach UXP offenhalten, indem die Emit-Logik in `motif-emit-ae` und **nicht** im Panel liegt.
5. **Die WebGPU-Wette ist gewonnen.** WebGPU ist seit Januar 2026 **Baseline** (Chrome, Edge,
   Firefox 147, Safari 26+), seit März 2026 W3C Candidate Recommendation, ~85 % globale Abdeckung.
   Das war die riskanteste Technologieentscheidung im Plan und ist jetzt keine mehr. WebGL2-Fallback
   trotzdem behalten: Firefox unter Linux und Android hinkt noch nach.
6. **Die Hardware diktiert die Architektur, nicht umgekehrt.** Auf einer RX 7600 XT gibt es kein
   TensorRT und keine 24-ms-Inferenz (§4.5). Statt das zu ignorieren, wird daraus die Bauweise:
   backend-agnostisches Interface (ROCm | DirectML), zweistufige Qualität (Proxy interaktiv,
   volle Auflösung im Hintergrund), SAM 3 als Einmal-Pass statt als Interaktionsmodell. Das ist
   kein Notbehelf — es ist ohnehin die bessere Architektur, die schwache Hardware nur erzwingt.
   Erfreulich: die Transition- und Grade-Seite (WebGPU) ist von der Hardwarefrage gar nicht betroffen.

---

## 5. Architektur

```
rotoscope/
  apps/
    studio-web/            React + Vite + TS. Viewer (WebGPU, WebGL2-Fallback),
                           Timeline (GSAP), Node-Graph (React Flow),
                           Parameter-Inspector (Tweakpane), Snapshot/Approve-UI.
    engine-py/             FastAPI. SAM3/SAM2, MatAnyone2, CoTracker3, Depth, DiffuEraser
                           hinter EINEM backend-agnostischen Interface
                           (PyTorch | TensorRT | ONNX). Lokaler Dienst, WebSocket + HTTP.
    cli/                   `rotoc` — compile / render / batch, headless.
  packages/
    motif-lang/            TS: Lexer → Parser → Typechecker (Units!) → MIR.
    motif-runtime-web/     MIR → GSAP-Timeline (Zeit) + WebGPU-Passes (Pixel).
    motif-emit-ae/         MIR → ExtendScript/UXP: echte Layer, Effekte, Keyframes.
    motif-emit-headless/   MIR → Render-Graph (wgpu) + ffmpeg-Muxing.
    motif-stdlib/          Transition-Library in MOTIF — Basis: gl-transitions-Import.
    grade-core/            Rust→WASM + Py-Binding: Reinhard/MKL/HM-MVGD-HM,
                           LUT-Fit, .cube IO, OCIO-Anbindung.
    mask-ops/              Rust→WASM + Py-Binding: Raster↔Bezier (CoTracker-gestützt),
                           Feather, Punkt-Korrespondenz.
    media-io/              mediabunny-Wrapper: Decode/Encode/Seek im Browser.
    interchange/           OTIO-Reader, Shape-Export (Nuke/Silhouette/Alembic), Cryptomatte-EXR.
  ae-extension/            CEP-HTML-Panel + ExtendScript (UXP existiert für AE noch nicht, §4.7).
  docs/licenses/           Pro Modell und pro Lib eine Datei. Nicht optional.
  docs/decisions/          ADRs, fortlaufend nummeriert.
```

**Warum die Zweiteilung Python/TS:** Die Modelle leben in PyTorch — dagegen kämpft man nicht an.
Die Sprache, das UI und die Motion-Semantik gehören dorthin, wo auch GSAP und der Browser leben.
Die Brücke ist die IR (JSON) + ein lokaler Socket. Beides ist ersetzbar, ohne das andere anzufassen.

**Rendering:** GSAP treibt **Zeit** (Timeline, Ease, Stagger, Scrub) — nicht die Pixel. Die Pixel
macht **WebGL2** über gl-transition-Shader ([ADR 004](docs/decisions/004-webgl2-statt-webgpu.md):
die Sammlung ist GLSL, WebGPU wäre WGSL und damit 125 Transpilationen ohne Gegenwert; WebGPU bleibt
für Compute-Aufgaben wie Histogramme im Look-Transfer). Das ist bewusst getrennt: so ist die Zeitachse
überall gleich (Web/AE/Headless), auch wenn die Pixel-Backends unterschiedlich sind.
WebGPU ist seit Januar 2026 Baseline in allen großen Browsern (§4.7) — der WebGL2-Fallback bleibt
trotzdem drin, solange Firefox/Linux und Android nachziehen.

---

## 6. MOTIF — die Sprache

Deklarativ, klein, unit-typisiert, deterministisch. Kein General-Purpose-Turing-Monster:
genug Ausdruckskraft für Motion + Farbe + Masken, und **nichts darüber hinaus**.

```motif
// stdlib/transitions/liquid-wipe.motif
transition liquid_wipe(
  amount   : px    = 140px,
  softness : px    = 2.4px,
  evolve   : 1/s   = 1.2/s,
  seed     : int   = 7,
) {
  a = clip.in
  b = clip.out
  duration = 18f              // Frames. `750ms` wäre genauso gültig.
  ease     = spring(stiffness: 180, damping: 14)

  field n = noise.simplex(scale: 0.004, evolve: evolve, seed: seed)

  layer mask {
    source  = roto("subject_01")        // Alpha aus der Roto-Engine
    feather = softness
    motion  = displace(field: n, amount: 0px -> amount)
  }

  layer grade {
    look = palette("ref/bladerunner.jpg")
    mix  = 0.0 -> 0.65 ease cubic(.22, 1, .36, 1)
  }

  emit ae      { as: layers,  precomp: true, bake_if_unsupported: true }
  emit web     { as: webgpu,  fallback: css }
  emit headless{ as: exr_seq, colorspace: acescg }
}
```

Ein importierter gl-transition sieht danach genauso aus wie ein eigener Node:

```motif
use gl("crosswarp")           // liest den GLSL-Vertrag + seine Uniforms ein

transition warp_cut {
  duration = 12f
  layer fx { node = gl.crosswarp(progress: 0 -> 1, ...) }   // Uniforms landen im Inspector
}
```

**Sprach-Entscheidungen, die früh feststehen müssen:**

- **Einheiten sind Typen.** `18f`, `750ms`, `2.4px`, `12%`, `45deg`, `1.2/s`. `18f + 750ms` ist
  gültig (Frames sind über die Projekt-Framerate definiert); `2.4px + 45deg` ist ein Typfehler.
  Das fängt die Hälfte aller Motion-Bugs zur Compile-Zeit.
- **`a -> b` ist Animation**, nicht Zuweisung. Ein animierter Wert ist ein eigener Typ.
- **Kein globaler Zustand, keine Schleifen.** Wiederholung nur über `stagger` / `repeat` — damit
  bleibt jede Transition auf jedem Frame unabhängig auswertbar (Voraussetzung für Scrubbing und
  verteiltes Rendering).
- **Zufall nur mit Seed.** `noise(...)` ohne `seed` ist ein Compile-Fehler.
- **`emit` ist Teil der Sprache**, nicht der Toolchain — die Datei sagt selbst, was sie in AE sein will.
- **Node-Signaturen sind gl-transition-kompatibel**, damit der Import in beide Richtungen funktioniert.

**IR (MIR):** JSON, flacher Node-Graph, jeder Node `{id, kind, params, inputs, time_range}`,
jeder Parameter entweder Konstante oder Kurve (`{keys:[{t, v, ease}]}`). **Die IR ist die stabile
Schnittstelle** — die Textsprache darf sich noch ändern, die IR-Version wird gepinnt.

---

## 7. Das Config-Tool (der eigentliche Arbeitsplatz)

- Links Node-Graph (React Flow), rechts Inspector (Tweakpane) mit **jedem** Parameter des
  selektierten Nodes, Mitte Viewer.
- Jeder Slider zeigt: aktueller Wert, Default, Einheit, gültiger Bereich, **und den Sprach-Ausdruck**
  der ihn erzeugt hat. Klick darauf → editieren als Text.
- Scrub-Preview in Echtzeit auf reduzierter Auflösung (mediabunny + WebCodecs), Vollauflösung on demand.
- **Approve-Flow:** tweaken → `Approve` → Snapshot mit Hash, Timestamp, Thumbnail und Diff zum
  Vorgänger. Snapshots sind die einzige Form von „Preset" im Produkt.
- A/B: zwei Snapshots, gleicher Frame, Split/Difference/Onion.
- **Qualitätsanzeige:** der Matting Quality Evaluator aus MatAnyone 2 markiert schwache Frames direkt
  in der Timeline. Der Nutzer sucht nicht nach Fehlern — das Tool zeigt sie.
- Alles was das UI tut, schreibt in die `.motif`-Datei. Kein separater UI-State, der driften kann.

---

## 8. Grade-Transfer — was konkret extrahiert wird

Nicht „ein LUT raten", sondern ein **parametrisches Look-Modell**, das man danach noch anfassen kann.
Verfahren nach `color-matcher` (§4.3), aber selbst implementiert:

| Komponente | Methode |
|---|---|
| Globale Farbstatistik | Reinhard: Mean/Std-Transfer in CIELAB als Basis |
| Genauere Verteilung | **MKL** (Monge-Kantorovich-Linearisierung) für Farbwolken-Matching |
| Robuste Variante | **HM-MVGD-HM**: Histogram-Matching → multivariate Gauß → Histogram-Matching |
| Palette | k-Means im Lab-Raum, k=5–8, gewichtet nach Flächenanteil |
| Kontrast | Tonwertkurve aus Luma-Histogramm-Matching, als editierbare Bezier-Kurve |
| Split-Tone | Hue/Sat getrennt für Schatten / Mitten / Lichter |
| Sättigung | Sat-über-Luma-Kurve (das, was „teuer aussehende" Looks ausmacht) |
| Textur-Vibe | Korn (Stärke/Größe), Halation, Bloom-Schwelle — separat schaltbar |

Ausgabe: **(a)** parametrischer Grade-Node in MOTIF (editierbar), **(b)** gebackenes 33³ `.cube`
für alles andere. Immer beides — der Node fürs Weiterarbeiten, das LUT für die Kompatibilität.
Ein-/Ausgangs-Transforms laufen über OCIO, damit Resolve und Nuke dasselbe sehen.

Wichtig: Der Mix-Regler ist kein Alpha-Blend auf dem Endbild, sondern interpoliert **die Parameter**.
Sonst sieht 50 % Look aus wie ein halbtransparenter Filter statt wie ein halb so starker Grade.

---

## 9. Nicht-Ziele

- Kein NLE. Kein Schnittprogramm, keine Audio-Mischung, keine Mediathek-Verwaltung.
- Kein 3D-Compositor, kein Node-Compositor-Vollersatz (Nuke/Fusion bleiben Nuke/Fusion).
- Keine Cloud-Rendering-Infrastruktur in v1.
- Keine Modell-Eigenentwicklung — vorhandene Checkpoints nutzen, nicht trainieren.
- Kein eigenes Shader-Format — gl-transitions ist der Vertrag.
- Keine Plugin-Marketplace/Community-Features vor v1.

---

## 10. Milestones

Jeder Milestone hat ein **Abnahmekriterium**, das man vorführen kann. Nicht „fertig", sondern „zeigbar".

> **Reihenfolge geändert am 2026-08-16** ([ADR 003](docs/decisions/003-roto-vorerst-ueber-sammie.md)):
> Der Roto-Eigenbau ist gestoppt, Masken kommen vorerst aus Sammie-Roto 2. Grund: M1–M2 haben
> nachgebaut, was Sammie bereits vollständig kann, während alles Unterscheidende — Transitions,
> MOTIF, Look-Transfer — unangetastet blieb. **Neue Reihenfolge: M3 zuerst, dann Look-Transfer,
> danach ggf. Bezier-Splines.** M1 bleibt als Teilstück stehen (Klick-Segmentierung läuft), M2
> ist ausgesetzt.

- **M0 — Skelett + Hardware-Spike.** Monorepo, `rotoc --version`, Web-App zeigt ein Video (mediabunny), Python-Engine antwortet auf `/health`.
  **Und, davor:** SAM 2 auf der RX 7600 XT zum Laufen bringen — erst PyTorch-ROCm Windows-nativ,
  bei Problemen ONNX-Runtime/DirectML, im Notfall WSL2. Ergebnis in `docs/decisions/001-inferenz-backend.md`
  festhalten: welcher Pfad, welche ms/Frame bei 960 px und bei voller Auflösung, welcher VRAM.
  *Abnahme: Dev-Server startet und zeigt Frame 0 — und es existiert eine gemessene Zahl für die
  Inferenz-Latenz. Ohne diese Zahl wird M1 nicht geplant.*
  **→ erledigt am 2026-08-16.** Skelett läuft (Engine, CLI, Viewer mit Frame 0 in 31 ms),
  Spike gemessen (§4.5.1), ADR 001 entschieden. Offen bleibt nur die Messung mit echten
  SAM-2-Gewichten — die gehört in M1, weil sie am Modell-Download hängt.
- **M1 — Roto Core.** UC-A1/A2/A3/**A11**/**E7**, E1/E2. **Engine-Interface backend-agnostisch** (ROCm | DirectML),
  SAM 2/EfficientTAM interaktiv auf Proxy, SAM 3 als Text-Prompt-Hintergrundpass, Propagation,
  Korrektur ohne Tracking-Verlust, Frame-Cache.
  *Abnahme: 200-Frame-Clip, „die Person im roten Mantel" per Text freigestellt, Korrektur auf Frame 47 hält —
  und die Klick-Korrektur bleibt unter 250 ms auf Proxy-Auflösung.*
- **M2 — Kanten & Farbe.** UC-A4/A5/A6, D1/D2/D3. MatAnyone 2 + **CoTracker3-gestützte Raster→Bezier** + Look-Extraktion + `.cube`.
  *Abnahme: Haar-Kante sauber; Maske als editierbare Splines in AE mit stabilen Punkten über 100 Frames; Referenzbild-Look als LUT in Resolve verifiziert.*
- **M3 — MOTIF v0.1 + Config-Tool.** UC-B1/B2/B3/B4/**B9**, C1/C2/C3, A7/A8/A12, D4/D5. Sprache, IR, gl-transitions-Import, Web-Runtime (WebGPU), Inspector, Approve.
  *Abnahme: importierter gl-transition im Browser getweakt, approved, als `.motif` committet, per CLI headless identisch gerendert.*
- **M4 — AE-Brücke, Pipeline & Batch.** UC-B5/B6/**B10**, C4/C5, A9/A10/**A13**, D6/D7, E3. Emit nach AE (CEP + ExtendScript), Shape-Export Nuke/Silhouette/Alembic, CLI-Batch, Parallax.
  *Abnahme: dasselbe `.motif` in AE geöffnet — Layer editierbar, Ergebnis deckungsgleich mit Web-Preview. Dieselben Splines öffnen sich in Nuke.*
- **M5 — Reaktiv & Roundtrip.** UC-B7/B8, C6, E4/E5/**E6**. Audio-Binding (aubio live / Essentia offline), Web-Export, AE-Panel, Watch-Folder, OTIO-Import.
  *Abnahme: Transition auf Beat-Grid gebunden; AE-Panel schickt Selection raus und bekommt Precomp zurück; OTIO-Schnittliste erzeugt Transitions an den echten Cuts.*
- **M6 — Härtung.** Performance, VRAM-Profile, Fehlerzustände, Doku, **vollständiges Lizenz-Audit**.
  *Abnahme: 4K-Clip auf Zielhardware innerhalb Budget; `docs/licenses/` deckt jedes ausgelieferte Modell und jede Lib ab.*

---

## 11. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| **GPL-3.0 von Sammie-Roto 2 und color-matcher** infiziert das Projekt | Keinen Code kopieren. Modelle direkt einbinden, Farbverfahren aus dem Paper selbst implementieren. |
| **SAM-3-Lizenz** ist eine Meta-eigene, nicht Apache | Vor M1 lesen und dokumentieren. SAM-2-Pfad (Apache-2.0) bleibt als Backend-Option bestehen — die Engine-Schnittstelle ist modellagnostisch zu bauen. |
| Modell-Lizenzen verbieten kommerzielle Nutzung (MatAnyone 2, VideoMaMa, DiffuEraser prüfen) | `docs/licenses/` ab M1 pflegen. Modelle als **optionale Downloads**, nicht gebundelt. |
| **Remotion-Lizenzschwelle** (ab 1 Mio. $ Umsatz) | Nicht einbauen ohne bewusste Entscheidung. Default: eigener wgpu-Renderer oder Revideo (MIT). |
| **Drei Renderer driften auseinander** | Golden-Frame-Tests: N Referenz-Frames pro Transition, alle drei Targets müssen unter Toleranz matchen. Ab M3 in CI. |
| AE-Scripting kann nicht alles, was WebGPU kann | `bake_if_unsupported: true` als expliziter, sichtbarer Fallback. Der Compiler **warnt**, wenn er backen muss. |
| **AE-Panel-Technologie veraltet unter den Füßen** (CEP heute, UXP irgendwann) | Emit-Logik liegt in `motif-emit-ae`, das Panel ist eine dünne Hülle. Panel-Wechsel CEP→UXP kostet dann Tage, nicht Monate. |
| **AMD/Windows: Modelle laufen gar nicht oder unbrauchbar langsam** | **Größtes Einzelrisiko des Projekts.** M0-Spike vor jeder Planung (§10). Zwei Pfade offenhalten (ROCm nativ / ONNX-DirectML), WSL2 als dritte Option. Wenn ein Modell auf gfx1102 nicht läuft: leichteres Modell, nicht mehr Zeit investieren. |
| ONNX-Export scheitert bei Video-Modellen (Memory-Attention, MatAnyone, CoTracker) | Vor M1 pro Modell prüfen, ob ein ONNX-Export existiert oder machbar ist. Ergebnis in `docs/decisions/`. Modelle ohne Exportpfad sind auf DirectML nicht verfügbar — das ist eine Auswahl-, keine Debugging-Frage. |
| **Preview zu langsam → Tool fühlt sich wie ein Batch-Job an** | Zweistufige Qualität (Proxy interaktiv / voll im Hintergrund) + Frame-Cache ab M1, nicht nachgerüstet. Budgets aus §4.5 werden in CI gemessen, nicht geschätzt. |
| **aubio ist GPL-3.0** | Für die Audio-Analyse Essentia bevorzugen, oder aubio nur als separaten Prozess aufrufen — nicht linken. |
| Sprache wächst zum Monster | Feature-Freeze für MOTIF v0.1 nach M3. Neue Sprachfeatures brauchen zwei reale Use-Cases als Begründung. |
| VRAM: SAM 3 + Matting + Depth + Remover | Modelle sequenziell laden/entladen, ROI-Cropping (UC-A10), Half-Precision, Auflösungs-Proxy fürs Preview. SAM-2/EfficientTAM-Pfad für kleine GPUs. |
| Temporal Flicker bei Masken und Grade | Temporal-Smoothing-Pass als eigener, abschaltbarer Node. Flicker-Metrik in den Golden-Tests. MQE (MatAnyone 2) als Frühwarnung. |
| Bezier-Punkt-IDs instabil | Über CoTracker3 lösen (§4.5). Nur wenn das scheitert: Kurvenlängen-Parametrisierung + Hungarian Matching als Eigenbau. |

---

## 12. Offene Entscheidungen (meine Empfehlung jeweils zuerst)

1. **Desktop-Shell?** → *Empfehlung: Tauri 2.* Web-UI bleibt Web-UI, aber Dateizugriff und Prozess-Start
   sind sauber. Alternative: reiner Localhost-Browser (schneller in M0, unbequemer ab M4).
2. **AE-Anbindung:** ~~UXP oder CEP?~~ → **Entschieden durch die Faktenlage: CEP-HTML-Panel + ExtendScript.**
   UXP-Panels existieren für After Effects Stand April 2026 schlicht nicht (§4.7). Kein Abwägen nötig,
   nur sauber kapseln, damit der spätere UXP-Wechsel billig bleibt. C++-AEGP nur, falls Panel und
   Scripting nachweislich nicht reichen.
3. **Rust-Anteil (`mask-ops`, `grade-core`):** *Empfehlung: ja, aber erst ab M2.* In M1 alles Python/TS,
   dann die zwei heißen Pfade portieren, wenn sie messbar wehtun.
4. **Farbraum-Policy:** *Empfehlung: intern linear ACEScg via OCIO*, Ein-/Ausgangs-Transform explizit.
   Teuer in M2, rettet einen ab M4 — und ist die Voraussetzung dafür, dass ein Studio das Tool ernst nimmt.
5. **Framerate-Modell:** *Empfehlung: ganzzahlige Projekt-FPS in v1*, NTSC-Drop-Frame erst wenn echtes Material es erzwingt.
6. **Headless-Renderer:** *Empfehlung: eigener wgpu-Pfad*, weil die Shader ohnehin gl-transition-kompatibel sind.
   Zwischenlösung für M3: `xfade-easing`/`ffmpeg-gl-transition`, um schnell etwas Renderndes zu haben.
7. **Interchange-Umfang:** *Empfehlung: SVG + AE in M2, Nuke/Silhouette/Alembic in M4.* Früher wäre
   Ballast, später verbaut man sich das Datenmodell der Splines.
8. **Inferenz-Backend:** *Empfehlung: PyTorch-ROCm Windows-nativ als Primärpfad, ONNX Runtime +
   DirectML als zweiter, gleichwertig gepflegter Pfad.* Kein TensorRT — die Hardware gibt es nicht her.
   **Entschieden wird das nicht am Schreibtisch, sondern vom M0-Spike** (§10). Das Interface steht ab
   M1, getauscht wird nur die Implementierung.
10. **Windows-nativ oder WSL2/Linux für die Engine?** *Empfehlung: Windows-nativ versuchen* — ROCm-7-Wheels
    für RDNA 3 unter Windows existieren, und ein Tool, das einen Dual-Boot verlangt, benutzt man nicht.
    WSL2 nur, wenn der Spike zeigt, dass es nativ nicht trägt. Beachten: WSL2-ROCm ist selbst nicht für
    jede Karte freigegeben — also im Spike **beides** anfassen, nicht nur eines.
9. **Neue Syntax oder eingebettete TS-DSL?** *Empfehlung: eigene Syntax*, weil Einheiten-Typen (`18f`,
   `2.4px`) und der `a -> b`-Animationsoperator in TypeScript nur als hässliche Wrapper existieren —
   und weil die Datei diffbar und für Nicht-Programmierer lesbar bleiben soll. Gegenprobe vor dem
   Bau: Motion Canvas (§4.2) hat den TS-Weg gewählt und funktioniert. Wenn der Parser in M3 mehr als
   zwei Wochen frisst, ist das das Signal zum Umschwenken.

---

## 13. Der Master-Prompt

> Ab hier: das, was man dem Coding-Agent gibt. Alles darüber ist Kontext, den er lesen soll.

```text
Du baust "RotoScope Studio" — ein lokales Desktop-Tool für KI-gestütztes Rotoscoping,
komponierbare Transitions und Farb-Look-Transfer aus Referenzbildern.

Verbindliche Quelle für Scope, Architektur, Use-Cases, Bausteine, Sprache und Reihenfolge ist
PROJECT_PROMPT.md in diesem Repo. Lies sie vollständig, bevor du eine Zeile schreibst.

REGELN
1. Arbeite Milestone für Milestone (§10). Beginne bei M0. Gehe erst zum nächsten Milestone,
   wenn das Abnahmekriterium des aktuellen tatsächlich vorführbar erfüllt ist — nicht,
   wenn der Code "grundsätzlich funktioniert".
2. Nutze die Bausteine aus §4. Baue nichts neu, was dort schon steht. Insbesondere:
   gl-transitions ist die Startbibliothek, CoTracker3 löst die Punkt-Stabilität,
   Tweakpane ist der Inspector, GSAP ist die Zeit-Engine (Pixel macht WebGPU).
3. Drei Fakten, die du nicht aus deinem Trainingswissen überschreibst (§0.1, §4.5, §4.7):
   - ZIELHARDWARE IST EINE AMD RX 7600 XT UNTER WINDOWS 11. Kein CUDA, kein TensorRT.
     Schlage niemals TensorRT, cuDNN oder CUDA-spezifischen Code vor. Inferenz läuft über
     PyTorch-ROCm (Windows-nativ) oder ONNX Runtime + DirectML, hinter EINEM backend-agnostischen
     Interface, das in M1 entsteht. Zahlen aus NVIDIA-Benchmarks gelten hier nicht.
   - After Effects hat KEINE UXP-Panels (Stand April 2026). Das AE-Panel ist CEP + ExtendScript.
     Halte die Emit-Logik in motif-emit-ae, nicht im Panel.
   - Interaktivität kommt aus der Architektur, nicht aus schneller Hardware: Proxy-Auflösung mit
     leichtem Modell im Vordergrund, volle Auflösung mit dem besten Modell im Hintergrund,
     Frame-Cache dazwischen. SAM 3 ist ein Einmal-Pass, kein Interaktionsmodell. Budgets: §4.5.
4. Kopiere KEINEN Code aus Sammie-Roto-2, color-matcher oder aubio (alle GPL-3.0). Nutze Modelle
   direkt, implementiere Farbverfahren selbst. Lege für jedes eingebundene Modell und jede
   Library docs/licenses/<name>.md an, mit Lizenz und kommerzieller Nutzbarkeit. Ohne diese
   Datei wird nichts eingebunden. Prüfe die SAM-3-Lizenz explizit, bevor du sie zur
   Default-Abhängigkeit machst — halte die Engine-Schnittstelle modellagnostisch, damit
   SAM 2 (Apache-2.0) jederzeit als Backend einspringen kann.
5. Halte die sechs Produkt-Prinzipien aus §3 ein. Wenn ein Vorschlag von dir gegen
   "Parameter-First, Preset-Last" oder "Determinismus" verstößt, verwirf ihn selbst.
6. Kein verstecktes Tuning. Jede magische Konstante im Renderer ist ein Bug: sie gehört
   als benannter Parameter in die MOTIF-Node-Signatur und damit in den Inspector.
7. Die MIR (§6) ist die stabile Schnittstelle zwischen Sprache und den drei Renderern.
   Ändere sie nur bewusst und versioniert. Node-Signaturen bleiben gl-transition-kompatibel.
8. Ab M3: Golden-Frame-Tests für jede Transition in allen aktiven Targets. Ein Target,
   das ein Feature nicht kann, muss das laut melden (Compiler-Warnung), nicht still
   anders rendern.
9. Schreibe Tests für: Unit-Typechecker der Sprache, MIR-Roundtrip, Determinismus
   (gleicher Seed → gleiches Ergebnis), LUT-Genauigkeit gegen colour-science als Referenz.

VORGEHEN PRO MILESTONE
- Skizziere zuerst die Module und ihre Schnittstellen, dann implementiere.
- Nenne explizit, welche Use-Case-IDs (UC-*) der Milestone abdeckt und welche nicht.
- Wenn eine Entscheidung aus §12 fällig wird, entscheide nach der dort genannten
  Empfehlung und notiere sie in docs/decisions/NNN-<titel>.md (kurz: Kontext,
  Entscheidung, Konsequenz).
- Wenn du auf einen Widerspruch in PROJECT_PROMPT.md stößt: benenne ihn, schlage die
  Auflösung vor, arbeite weiter — blockiere nicht.

STARTE JETZT MIT M0.
```

---

## 14. Nächste konkrete Schritte

1. **Der Hardware-Spike ist Schritt eins, vor allem anderen.** HIP SDK + PyTorch-ROCm-Wheel für
   RDNA 3 unter Windows installieren, SAM 2 auf einem echten Clip laufen lassen, ms/Frame bei
   960 px und bei voller Auflösung notieren. Parallel ONNX-Runtime/DirectML mit demselben Modell.
   Ergebnis nach `docs/decisions/001-inferenz-backend.md`. **Alles im Plan hängt an dieser Zahl.**
2. Die eine verbliebene Ratestelle korrigieren: die Video-Inspiration (§0).
3. **Lizenz-Vorprüfung parallel zum Spike:** SAM 3, MatAnyone 2, CoTracker3, DiffuEraser, mediabunny.
   Rahmen ist „privat, Option offen" — also dokumentieren statt blockieren, aber GPL-Code bleibt draußen.
4. **ONNX-Exportierbarkeit prüfen** für MatAnyone 2 und CoTracker3. Ohne Exportpfad sind sie auf dem
   DirectML-Backend nicht verfügbar — das beeinflusst die Modellauswahl in M2, nicht erst M6.
5. `git init`, Monorepo-Skelett, dann M0.

---

## Quellen

- [Zarxrax/Sammie-Roto-2](https://github.com/Zarxrax/Sammie-Roto-2) · [Sammie-Roto](https://github.com/Zarxrax/Sammie-Roto)
- [facebookresearch/sam3](https://github.com/facebookresearch/sam3) · [SAM 3 Paper (arXiv 2511.16719)](https://arxiv.org/pdf/2511.16719) · [SAM 3 Docs (Ultralytics)](https://docs.ultralytics.com/models/sam-3) · [MarkTechPost: SAM 3 Release](https://www.marktechpost.com/2025/11/20/meta-ai-releases-segment-anything-model-3-sam-3-for-promptable-concept-segmentation-in-images-and-videos/)
- [pq-yang/MatAnyone2](https://github.com/pq-yang/MatAnyone2) · [pq-yang/MatAnyone](https://github.com/pq-yang/MatAnyone)
- [facebookresearch/co-tracker](https://github.com/facebookresearch/co-tracker)
- [lixiaowen-xw/DiffuEraser](https://github.com/lixiaowen-xw/DiffuEraser) · [sczhou/ProPainter](https://github.com/sczhou/ProPainter)
- [gl-transitions/gl-transitions](https://github.com/gl-transitions/gl-transitions) · [gl-transitions.com](https://gl-transitions.com/) · [scriptituk/xfade-easing](https://github.com/scriptituk/xfade-easing) · [transitive-bullshit/ffmpeg-gl-transition](https://github.com/transitive-bullshit/ffmpeg-gl-transition)
- [Webflow: GSAP wird 100 % kostenlos](https://webflow.com/blog/gsap-becomes-free) · [GSAP Standard License](https://gsap.com/community/standard-license/) · [GSAP 3.13](https://gsap.com/blog/3-13/)
- [Remotion vs. Motion Canvas vs. Revideo (2026)](https://www.pkgpulse.com/guides/remotion-vs-motion-canvas-vs-revideo-programmatic-video-2026)
- [hahnec/color-matcher](https://github.com/hahnec/color-matcher) · [AcademySoftwareFoundation/OpenColorIO-Config-ACES](https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES)
- [cocopon/tweakpane](https://github.com/cocopon/tweakpane) · [MelonCode/react-tweakpane](https://github.com/MelonCode/react-tweakpane) · [React Flow](https://reactflow.dev/)
- [Vanilagy/mediabunny](https://github.com/Vanilagy/mediabunny) · [Mediabunny Docs](https://mediabunny.dev/guide/introduction)
- [airbnb/lottie-web](https://github.com/airbnb/lottie-web)
- **AE-Scripting-Realität:** [after-effects-sdk-kb: UXP-Status-Note](https://github.com/pushREC/after-effects-sdk-kb/blob/main/scripting/UXP-STATUS-NOTE.md) · [ExtendScript vs. UXP](https://aftereffectscloud.wordpress.com/2025/09/12/extendscript-vs-uxp-which-one-should-you-learn/) · [ExtendScript-Status 2026](https://mapsoft.com/posts/extendscript.html)
- **Inferenz auf AMD/Windows (maßgeblich für dieses Projekt):** [ROCm vs. CUDA 2026](https://www.kunalganglani.com/blog/rocm-consumer-gpu-cuda-alternative-2026) · [Lokale AI auf AMD: ROCm-Performance 2026](https://www.mindstudio.ai/blog/running-local-ai-amd-rocm-ollama-lm-studio) · [ROCm-Installation unter Windows (HIP SDK / ROCm 7)](https://en.windowsnoticias.com/rocm-installation-guide-on-windows/) · [ONNX Runtime: DirectML Execution Provider](https://onnxruntime.ai/docs/execution-providers/DirectML-ExecutionProvider.html) · [AMD: Windows-ML-Beschleunigung, Build 2026](https://www.amd.com/en/blogs/2026/advancing-windows-ml-acceleration-with-amd-at-microsoft-build-2026.html) · [AMD GPUOpen: ONNX + DirectML Guide](https://gpuopen.com/learn/onnx-directlml-execution-provider-guide-part1/)
- **Inferenz-Performance auf NVIDIA (Referenz — NICHT für die Zielhardware gültig):** [dataplayer12/SAM3-TensorRT](https://github.com/dataplayer12/SAM3-TensorRT/) · [SAM 3 TensorRT Benchmarks](https://yimin-pan.github.io/sam3-trt/) · [tier4/sam2_trt_inference](https://github.com/tier4/sam2_trt_inference) · [TIER IV: SAM2 mit TensorRT](https://medium.com/tier-iv-tech-blog/high-performance-sam2-inference-framework-with-tensorrt-9b01dbab4bf7)
- **Pipeline-Standards:** [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) · [OpenAssetIO](https://github.com/OpenAssetIO/OpenAssetIO) · [Mocha Pro (Boris FX)](https://borisfx.com/products/mocha-pro/) · [Mocha 2026.5 User Guide](https://borisfx.com/documentation/mocha/2026.5.0/)
- **WebGPU-Status:** [WebGPU Baseline in allen Browsern](https://www.webgpu.com/news/webgpu-hits-critical-mass-all-major-browsers/) · [Frontier Web APIs 2026](https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready)
- **Audio:** [Essentia.js](https://essentia.upf.edu/essentia_python_examples.html) · [aubio/aubio](https://github.com/aubio/aubio)
