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
  Verletzungs-Blitz). Bei 0 stirbst du.
- **Der Hai:** Es gibt genau einen. Er patrouilliert im Meer und greift
  an, sobald du ihm im Wasser zu nahe kommst. Mit dem **Hammer in der
  Hand** wehrst du ihn ab: Linksklick (bzw. E ohne Ziel) schlägt zu —
  trifft der Schlag, flieht der Hai für längere Zeit. An Bord bist du
  sicher.
- **Luft (0–100):** Tauchen verbraucht 3 Punkte pro Sekunde; an der
  Oberfläche regeneriert die Luft in 8 Sekunden vollständig. Ohne Luft
  wird der Blick dunkel und die Nahrung schwindet schnell.
- Beide Werte werden im HUD links unten angezeigt.

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
  Seemonster, groß und hellrot der Boss.
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

Die Taste **L** öffnet jederzeit das Cheat-Menü: Debug-Anzeige
(FPS/Position), Kollisionsboxen, Teleports, Werte auffüllen,
Materialpakete, Motor-Schnellreparatur, Hai herbeirufen, Taucherhelm
aufsetzen u. a. — kein URL-Parameter nötig.

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
- Alle Stellschrauben: `src/config.ts` · Alle Texte: `src/ui/strings.de.ts`

## Build

```bash
npm run build     # Typprüfung + Produktions-Build nach dist/
npm run preview   # Produktions-Build lokal testen
```

Für den späteren nativen Download ist Tauri vorgesehen (verpackt den
unveränderten Web-Build); alle Pfade sind bereits relativ (`base: './'`).
