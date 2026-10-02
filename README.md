# Deep in the Dark

Browserbasiertes First-Person-Survival-Spiel mit Retro-Pixel-Look.
Gestrandet auf einem Boot vor unendlich hohen Klippen: Bring den Motor
wieder in Gang – oder lade das Funkgerät auf und rufe Hilfe.

## Starten (Entwicklung)

```bash
npm install
npm run dev
```

Dann im Browser öffnen: http://localhost:5173

## Steuerung

| Taste | Aktion |
|---|---|
| Maus | Umsehen |
| W A S D | Bewegen / Schwimmen |
| C oder steil nach unten blicken + W | Abtauchen |
| Leertaste | Auftauchen (beim Tauchen) / Springen (an Deck) / Leiter loslassen |
| E | Interagieren (Aufheben, Fangen) |
| Tab oder I | Inventar |
| 1–6 | Schnellinventar benutzen (Fisch essen) / auswählen |
| Scrollrad | Schnellinventar-Slot wechseln |
| Esc | Pause |

Der Knopf **⛶** rechts oben schaltet das Vollbild an und aus (am Rechner
sichtbar, solange die Maus nicht im Spiel gefangen ist). Auf
Touch-Geräten erscheint stattdessen der Steuerung ein Joystick links,
eine Wischfläche rechts und Knöpfe für E, Auf/Ab, Inventar, Pause und
das Debug-Menü.

**Leitern** braucht man nicht anzuwählen: Wer nah genug davorsteht und
zur Leiter blickt, greift sie automatisch. Von oben (Deck- bzw.
Dachkante) genügt der Blick nach unten. Geklettert wird dann allein mit
der Maus – Blick nach oben steigt auf, Blick nach unten ab, waagerechter
Blick hält an; je steiler der Blick, desto schneller. Oben und unten
steigt man automatisch aus, zwischendurch löst die Leertaste.

## Überleben

- **Nahrung (0–100):** Bewegung (Schwimmen, Tauchen, Gehen, Klettern)
  kostet 1 Punkt pro 10 Sekunden. Fische fangen (E), ins Schnellinventar
  legen und mit Taste 1–6 essen (+35, großer Fisch +70; wird über
  3 Sekunden animiert angerechnet). Bei 0 bist du erschöpft und langsam.
- **Schnellinventar:** 6 Slots am unteren Bildschirmrand. Im Inventar
  (Tab) verschiebt ein Klick Items dorthin und zurück; die Tasten 1–6
  benutzen den jeweiligen Slot. Das ausgewählte Item hält der Spieler
  sichtbar in der Hand.
- **Leben (0–100):** Der Hai zieht pro Biss 30 Leben ab (roter
  Verletzungs-Blitz). Bei 0 stirbst du. Der Jumpscare des Stalkers
  (siehe unten) lässt dir nur noch 10 Leben.
- **Der Hai:** Es gibt genau einen. Er patrouilliert im Meer und greift
  an, sobald du ihm im Wasser zu nahe kommst. Mit dem **Hammer in der
  Hand** wehrst du ihn ab: Linksklick (bzw. E ohne Ziel) schlägt zu —
  trifft der Schlag, flieht der Hai für längere Zeit. An Bord bist du
  sicher.
- **Luft (0–100):** Tauchen verbraucht 3 Punkte pro Sekunde; an der
  Oberfläche regeneriert die Luft in 8 Sekunden vollständig. Ohne Luft
  wird der Blick dunkel und die Nahrung schwindet schnell.
- Beide Werte werden im HUD links unten angezeigt.

## Der Stalker

Eine hagere, überlebensgroße Gestalt, die einen nur ansieht – sie
verfolgt niemanden, sie ist plötzlich da und gleich wieder weg. Es gibt
genau einen; die meiste Zeit ist er gar nicht in der Welt. Er erscheint
immer im Blickfeld, in einer von drei Varianten – je nachdem, wo man
gerade steckt:

- **An Deck:** Er steht irgendwo an Bord (Gang, Vor-/Achterdeck oder auf
  der Dachplatte) und dreht sich zum Spieler. Wer sich ihm nähert, sieht
  ihn kurz zwinkern – dann ist der Platz leer. Das Boot darf dabei
  fahren, er steht fest an seinem Platz an Deck.
- **Am Himmel:** Er hängt reglos in der Luft über dem Wasser, 16–38 m
  hoch und 30–65 m entfernt. Er bewegt sich nicht von der Stelle, dreht
  sich aber immer zum Spieler.
- **Unter Wasser:** Er steht aufrecht im Freiwasser und wartet. Taucht
  man auf, verliert man ihn aus den Augen.

**Nicht hinsehen:** Gefährlich wird er nur durch Blickkontakt. Wer ihn
**5 Sekunden** lang ununterbrochen *direkt* ansieht – er steht im
Fadenkreuz –, wird angesprungen: Bild flackert, ein Schrei, und danach
bleiben nur noch **10 % Leben**. Das gilt für alle drei Auftritte.
Wegsehen baut den Countdown wieder ab (anderthalbfach so schnell, wie er
steigt), ein kurzer Blick ist also harmlos. Was als „direkt ansehen“
zählt, richtet sich nach seiner scheinbaren Größe: aus der Nähe genügt
grobes Hinschauen, aus der Ferne muss man ihn genau anpeilen. Und
solange man ihn ansieht, wartet er – seine Auftrittsdauer läuft dann
nicht ab.

**Die Störung als Warnung:** Sobald der Countdown läuft, legt sich eine
atmosphärische Störung über das ganze Bild – versetzte Zeilenbänder, ein
wandernder Störbalken, Farbversatz, Rauschen und Helligkeitsflimmern.
Sie wächst mit dem Countdown: Der erste Moment Blickkontakt bleibt
sauber, dann fängt es an zu grieseln, und in der letzten Sekunde reißt
das Bild auseinander. Wer wegsieht, sieht die Störung wieder abklingen –
sie ist also die Vorwarnung, nicht bloß Effekt. Der Effekt selbst sitzt
im Upscale-Shader (`src/rendering/PixelRenderer.ts`), seine Stärken
stehen in `CONFIG.render.stoerung`, die Kurve in
`CONFIG.stalker.stoerung`.

**Der Schrei:** Beim Jumpscare schreit es – ein kurzer Todesschrei, der
in verzerrte, irre Lacher übergeht (`public/assets/audio/stalker-scream.mp3`,
5 s, erzeugt mit Suno und nachbearbeitet). Fehlt die Datei, synthetisiert
das Spiel den Schrei selbst (mehrschichtig: Sub-Bass-Aufprall, eine von
Rauschen zerrissene, mehrfach kippende Stimme durch wandernde Formanten
und Verzerrer, ein verzögert einsetzendes Kreischen, ein subharmonisches
Grollen, Faltungshall und Kompressor – siehe
`src/systems/AudioManager.ts`). Pfad und Lautstärke stehen in
`CONFIG.audio`.

Zwischen zwei Auftritten vergehen 70–170 Sekunden – außer im
**Tiefentempel** (siehe unten): Dort ist er am häufigsten. Die Pausen
schrumpfen auf 10–28 Sekunden, eine laufende lange Pause wird beim
Betreten sofort gekürzt, und er steht dann immer in einem Gang, den man
von seinem Platz aus einsehen kann – nie hinter einer Wand. Wer den
Tempel verlässt, lässt ihn drinnen zurück. Alle Werte stehen in
`CONFIG.stalker` (`src/config.ts`, der Tempel unter `labyrinth`), die
Auftritte selbst in `src/world/Stalker.ts`. Zum Ausprobieren gibt es im
Cheat-Menü (Taste L) je einen Eintrag pro Variante.

## Sunkey

**Sehr selten:** Nur in jedem tausendsten Spiel gibt es Sunkey
überhaupt – beim Start eines neuen Spiels wird einmal gewürfelt
(`CONFIG.sunkey.chance`). In allen anderen Spielen erscheint sie nie.

Eine flache, lila Gestalt (`sunkey.glb`), die knapp über dem Wasser
steht – immer genau so weit weg, dass sie gerade noch aus dem Nebel
schaut (rund 100 m), und immer mit dem Gesicht zum Spieler. Näher kommt
man ihr nicht: Sie hält den Abstand, egal wohin man schwimmt oder fährt.
Sie erscheint nur, wenn man über Wasser schaut (an Deck oder an der
Oberfläche), nie gleichzeitig mit dem Stalker, und taucht man ab, ist
sie weg.

**Nicht hinsehen:** Wie beim Stalker baut direktes Ansehen einen
Countdown auf (5 Sekunden, dazu die wachsende Bildstörung). Ist er
durch, springt sie einen an – aber ohne Schrei: Alles verstummt. Man
stirbt nicht, aber es folgt eine Sequenz:

1. Schwarzer Bildschirm, völlige Stille.
2. Nach 5 Sekunden erscheint langsam ein großes, zitterndes, rotes
   **„WHY?“**. Dazu beginnt „Daisy Bell“ (1892, gemeinfrei; als
   verstimmte Spieluhr synthetisiert) **rückwärts** und schwillt in
   18 Sekunden von 0 auf volle Lautstärke an.
3. Die Musik bricht ab, der Stalker-Schrei läuft **rückwärts**.
4. Ist er vorbei, verschwindet der schwarze Bildschirm mit einem weißen
   Blitz – man ist wieder im Spiel. Über dem laufenden Spiel ziehen
   14 Sekunden lang acht große Sunkeys direkt hintereinander von rechts
   nach links, dazu ihr irres Lachen (`public/assets/audio/sunkey-lachen.mp3`:
   hohes, manisches Gackern, mit Suno erzeugt und danach verzerrt, in
   mehreren Tonhöhen geschichtet und zerhackt).

Werte: `CONFIG.sunkey` (`src/config.ts`), die Gestalt in
`src/world/Sunkey.ts`, der schwarze Bildschirm in
`src/states/WhyState.ts`, Blitz und Parade in `src/ui/SunkeyParade.ts`. Cheat: „Sunkey erscheinen lassen“.

## Der Riese

In der Seemitte wartet ein Riese (`giant.glb`). Kommt man ihm auf etwa
160 m nahe, steigen seine Glieder aus der Tiefe, und er steht bis zur
Hüfte im Wasser. Sein Kopf ragt so hoch auf wie das Maul des Bosses beim
Durchbruch – rund 60 m über dem Wasserspiegel. Seine Beine sieht man nie:
Unter der Wasserlinie wird er abgeschnitten, und wer in seiner Nähe
taucht, steckt in trübem, schlammigem Wasser.

Er dreht sich zum Spieler und watet langsam auf ihn zu. Ist man in
Reichweite (etwa 30–75 m), holt er mit dem linken Arm weit über den Kopf
aus und schlägt den Unterarm flach aufs Wasser – ein 20 m breiter und
65 m langer Streifen links vor ihm. **Wer darin ist, an der Oberfläche
oder an Deck, ist sofort tot.** Die Richtung steht fest, sobald er
ausholt: Wer dann quer zum Arm ausweicht, überlebt. Wer tiefer als 8 m
taucht, ist außer Reichweite – dann greift er gar nicht erst an.
Entfernt man sich weiter als 340 m, versinkt er wieder.

Werte: `CONFIG.giant` (`src/config.ts`), Verhalten in
`src/world/Giant.ts`. Auf der Minimap ist er die große violette Marke.

## Der Tiefentempel

Weit draußen im Südosten des Sees, bei x 460 / z 450, liegt in gut
30 m Tiefe eine versunkene Tempelanlage: ein breiter, abgetreppter
Sockel, darauf ein massiger Mauerblock mit Strebepfeilern, vier
Ecktürmen und einem dreistufigen Dach mit Krone, Zinnen und Spitze.
Vorn, zur Küste hin, springt ein Torhaus zwischen zwei Obelisken vor.
Bernsteinfarbene Leuchtsteine markieren Tor, Türme und Krone. Auf der
Minimap erscheint der Grundriss, sobald man in der Nähe ist.

Innen läuft hinter dem Tor ein **langer Umgang** einmal rund um das
Labyrinth – denn der **Eingang ins Labyrinth liegt auf der
gegenüberliegenden Seite**. Das **Labyrinth** (15 × 15 Felder à 4 m)
nimmt fast den ganzen Bau ein; in seiner Mitte wartet die
**Schatzkammer** mit acht Goldbarren. Der Weg vom Labyrintheingang bis
dorthin ist über 200 m lang.

**Fallen** (48 Stück, übers ganze Labyrinth verteilt, nie zwei
nebeneinander – zwischen zwei Fallen kann man immer den Takt abwarten):

| Falle | Wirkung | Schaden |
|---|---|---|
| Stachelfalle | Spieße schießen aus Boden und Decke, vorher lugen die Spitzen kurz heraus | 25 |
| Pendelaxt | schwingt quer zum Gang von Wand zu Wand; darüber, darunter und in der Mitte passt niemand durch – nur an der Seite, von der sie gerade weg ist | 35 |
| Harpunenfalle | Mündungen in der Seitenwand glühen rot, dann fliegt eine Salve quer über den Gang | 15 |
| Fallbeil | ruckelt kurz in der Decke und saust dann herab | 40 |

Nach einem Treffer schützt eine kurze Schonfrist vor dem nächsten.

**Luftblasen:** Unter der Decke hängen silbrig schimmernde Luftblasen,
erkennbar an den aufsteigenden Perlen und einem Bronzering im Boden.
Wer den Kopf hineinsteckt (ganz nach oben schwimmen), atmet durch – die
Luft füllt sich wie an der Oberfläche. Im Umgang sitzen sie an den Ecken
und Seitenmitten, im Labyrinth ist keine Stelle mehr als 8 Felder Weg
von der nächsten entfernt.

Die Gestalt ist eine eigene Schöpfung. Nur die Grundidee, eine
versunkene Tempelanlage mit Innenleben, ist vom Ozeanmonument aus
Minecraft inspiriert. Grundriss, Proportionen, Aufbau, Farben und
Innenleben sind eigenständig. Es gibt keine Blöcke, kein Prismarin und
keine Wächter.

Stellschrauben (Lage, Labyrinthgröße, Luftblasen, Fallen und ihr Takt):
`CONFIG.tiefentempel` in `src/config.ts`. Grundriss und Labyrinth-
Generator: `src/world/TempelPlan.ts`, Bau und Fallen:
`src/world/Tiefentempel.ts`. Das Labyrinth ist aus einem festen Seed
erzeugt und sieht in jedem Spiel gleich aus. Im Cheat-Menü gibt es
Teleports vor das Tor, an den Labyrintheingang und in die Schatzkammer.

## Tiefenanzeige

Am linken Bildrand läuft eine senkrechte Skala über die ganze
Bildschirmhöhe: oben die Wasseroberfläche (0 m), unten 120 m, alle 10 m
ein Teilstrich, alle 20 m eine Zahl. Eine gelbe Marke mit Zahl zeigt die
aktuelle Tiefe des Kopfes; an Deck und an der Oberfläche steht sie auf
0 m. Der braune Sockel am unteren Ende ist der **Seeboden unter dem
Spieler** – er zeigt, wie tief es an dieser Stelle überhaupt geht (am
Küstenschelf rund 12 m, in der Seemitte über 100 m).

Stellschrauben (Skalenende, Teilstriche): `CONFIG.tiefenanzeige` in
`src/config.ts`; Aufbau in `src/ui/DepthGauge.ts`.

## Minimap

Rechts oben liegt eine kreisrunde Minimap mit **100 m Radius**. Der
Spieler steckt immer in ihrer Mitte, seine **Blickrichtung zeigt immer
nach oben** – die Karte dreht sich also mit. Am Steuer heißt das: die
Karte dreht mit dem Schiff.

- **Meeresboden:** Die Farbe zeigt die Wassertiefe (heller Schelf bis
  tiefschwarzblaue Seemitte), Schattierung und Tiefenlinien alle 10 m
  zeigen Rücken, Kuppen und Hänge. Braun ist die Steilküste.
- **Schiff:** weiße Rumpfform, maßstäblich und in Fahrtrichtung. Ist es
  weiter als 100 m weg, bleibt es als kleiner Punkt am Kartenrand
  sichtbar – so findet man zurück.
- **Kreaturen:** Pfeilspitzen in Fahrtrichtung – orange der Hai, rot das
  Seemonster, groß und hellrot der Boss, noch größer und violett der
  Riese.
- Der helle Bogen am Kartenrand markiert **Norden**.

Stellschrauben (Radius, Auflösung): `CONFIG.minimap` in `src/config.ts`.

## Crafting

In der Kajüte steht ein Tisch — die **Werkbank** (E: Benutzen). Sie
öffnet ein 3×3-Feld: Items per Klick aus dem Inventar hineinlegen,
passt die Kombination, erscheint rechts das Ergebnis; ein Klick darauf
stellt es her. Die Anordnung im Feld ist egal, nur die Mengen zählen.

Rezepte:

| Zutaten | Ergebnis |
|---|---|
| 3× Eisen + 2× Holzplanke | Hammer |

**Fässer zerlegen:** Ein Klick auf ein Fass legt es in den rechten
Slot; die Ausbeute erscheint links im Feld — immer 4 Planken + 4 Eisen,
dazu genau eine zufällige Ressourcen-Sorte (Nyzerin/Glyzerin/Gold bis 3,
Stein bis 5, Nahrung bis 6, Plastik bis 11). Nahrung ist essbar (+25).

**Treibstoff:** Seltene Treibstofffässer (rote Fässer, weit draußen)
enthalten 0–76 Liter — beim Aufsammeln wandert der Inhalt in den
Treibstoff-Vorrat (im Inventar sichtbar), das leere Fass bleibt als
Item.

## Motor-Reparatur

Der Motor im Motorraum braucht: **50 Eisen, 50 Gold, 20 Nyzerin,
20 Glyzerin und 100 Liter Treibstoff**. Wer ihn anvisiert, sieht die
Materialliste mit Fortschrittsbalken. Material anwenden: gewünschtes
Material im Schnellinventar auswählen und **E** am Motor drücken — der
gewählte Stapel wird verbaut, Treibstoff fließt automatisch aus dem
Vorrat. Sind alle Balken voll, springt der Motor an: Er brummt und
glüht rot.

## Intro-Video

Eine Datei `public/assets/intro.mp4` wird beim Start abgespielt
(überspringbar mit Esc/Leertaste/Klick). Fehlt sie, geht es direkt
ins Hauptmenü.

## Taucherhelm

Der Taucherhelm legt sich als Bild (`public/assets/hud/helmet.png`) über
die ganze Sicht: Man schaut durch die Fenster des Visiers, der Rand ist
dicht. Am Steuer (Außenkamera) blendet er sich automatisch aus.

Das **Rezept folgt noch** — bis dahin setzt man ihn über das Cheat-Menü
auf (siehe unten). Voreinstellungen: `CONFIG.taucherhelm` in
`src/config.ts`:

| Wert | Bedeutung |
|---|---|
| `bild` | Pfad des Overlay-Bilds |
| `modus` | `strecken` (aufs Bildschirmformat gezogen) oder `quadrat` (formtreu, oben/unten beschnitten) |
| `skalierung` | 1 = füllt den Bildschirm genau aus |
| `versatzX` / `versatzY` | Verschiebung in % der Bildschirmgröße |
| `deckkraft` | 0–1 |
| `pixelig` | Nearest-Neighbor-Skalierung (Pixel-Look) |
| `randfarbe` | füllt den Bereich außerhalb des Bilds (bei Skalierung < 1) |

## Cheats / Debug

Die Taste **L** öffnet jederzeit das Cheat-Menü (auf Touch-Geräten der
Knopf **DBG** oben rechts): Debug-Anzeige (FPS/Position),
Kollisionsboxen, Teleports, Werte auffüllen, Materialpakete,
Motor-Schnellreparatur, **3× schneller tauchen**, Hai herbeirufen,
Stalker erscheinen lassen (an Deck / am Himmel / unter Wasser / im
Tiefentempel), Teleports zum Tiefentempel, **Boot in die Seemitte zum
Riesen**, **Sunkey erscheinen lassen**, Taucherhelm aufsetzen u. a. —
kein URL-Parameter nötig.

Zwei Schalter zeigen im Menü, ob sie gerade an sind:

- **Unendlich Luft, Nahrung und Leben:** Alle drei Balken bleiben voll,
  Haibisse, Fallen und der Stalker-Jumpscare ziehen nichts ab, Ertrinken
  ist abgeschaltet. Sofort-Tode, die nicht an den Werten hängen
  (Seemonster, Boss, sinkendes Schiff), bleiben tödlich.
- **Karte des Tiefentempels:** Links neben der Minimap erscheint der
  komplette Grundriss – Außenwand mit Tor, Umgang, jede Labyrinthwand,
  die Schatzkammer (gold), Luftblasen (hellblau) und Fallen (rot), dazu
  der Spieler als Pfeil in Blickrichtung. Norden ist oben. Außerhalb
  des Tempels klebt der Pfeil am Kartenrand und darunter steht die
  Entfernung. Code: `src/ui/LabyrinthKarte.ts`.

**Taucherhelm justieren:** Der Cheat *„Taucherhelm justieren (Tastatur)
an/aus“* setzt den Helm auf und blendet links eine Anzeige mit den
aktuellen Werten ein. Justiert wird im laufenden Spiel:

| Taste | Wirkung |
|---|---|
| Pfeiltasten | Versatz X/Y |
| `+` / `-` | Skalierung |
| `[` / `]` | Deckkraft |
| M | Modus (strecken / quadrat) |
| N | Pixelig an/aus |
| H | Helm auf-/absetzen |
| R | zurück auf die Werte aus `CONFIG` |
| Shift | feine Schritte |

Die Anzeige zeigt unten die eingestellten Werte in der Schreibweise von
`CONFIG.taucherhelm` — passt die Justierung, wandern sie dort hinein.
Bis dahin merkt sich der Browser sie (localStorage).

## Technik

- [Three.js](https://threejs.org) (MIT) + [Vite](https://vite.dev) (MIT) + TypeScript
- Keine Physik-Engine: eigener kinematischer Character-Controller
  (Schwimmen, Tauchen, Leiterklettern, Gehen) mit AABB-Kollision
- Pixel-Look: Rendering in ein 480×270-RenderTarget, Nearest-Neighbor-
  Upscaling, Posterisierung + Bayer-Dithering (`src/config.ts`)
- Das Boot entsteht prozedural aus dem deklarativen Layout in
  `src/world/boatLayout.ts`
- Seeboden: Relief aus Value-Noise (`src/world/lake.ts`), Geröll und
  Klippen (`src/world/Seabed.ts`) sowie rund 150 versunkene Pagoden
  (`src/world/Pagodas.ts`) – ca. 100 kleine mit vier Säulen und einem
  Dach, ca. 50 große mit acht Säulen, Obergeschoss und zwei Dächern.
  Alles deterministisch aus Rasterindizes geseedet; Anzahl und
  Uferabstand in `CONFIG.pagoden`. Unter dem Tiefentempel wird der Grund
  zu einer ebenen Mulde abgetragen (`lake.ts`)
- Alle Stellschrauben: `src/config.ts` · Alle Texte: `src/ui/strings.de.ts`

## Build

```bash
npm run build     # Typprüfung + Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen
```

Für den späteren nativen Download ist Tauri vorgesehen (verpackt den
unveränderten Web-Build); alle Pfade sind bereits relativ (`base: './'`).
