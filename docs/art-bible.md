# Art-Bible — Deep in the Dark

Dieses Dokument ist der verbindliche visuelle Maßstab des Spiels. Jede
Änderung an Modellen, Texturen, Materialien, Licht oder Effekten wird
gegen diese Regeln geprüft. Es beschreibt den **Retro-Pixel-Look als
Marke**, nicht einen Zwischenschritt zu mehr Wiedergabetreue.

## 1. Zielbild

Ein gestrandeter Überlebender in einem kalten, endlosen See unter
Steilküsten. Das Bild soll ruhig, nass und klaustrophobisch wirken:
kühle Blau-Grau-Töne tragen die Welt, Wärme gibt es nur punktuell
(Holz im Boot, Gold, Motorrot) und sie bedeutet immer etwas. Alles ist
grobkörnig und hartkantig – kein Weichzeichnen, kein Anti-Aliasing.

## 2. Bild (Render)

| Regel | Wert | Ort |
|---|---|---|
| Interne Auflösung | 480 × 270, nearest hochskaliert | `CONFIG.render` |
| Posterisierung | 22 Stufen | `CONFIG.render.posterizeLevels` |
| Dithering | Bayer 4×4, an | `CONFIG.render.dither` |
| Vignette | 0,30 Randabdunklung | `CONFIG.render.vignette` |
| Atmosphärische Störung | nur als Blick-Warnung | `CONFIG.render.stoerung` |
| Farbe | sRGB, Texturen mit `SRGBColorSpace` | `rendering/Textures.ts` |

Die Vignette zieht den Blick zur Mitte. Die Störung bleibt **selten und
bedeutsam** (Stalker/Sunkey-Blick): nie als Dauer-Effekt.

## 3. Palette

Zentral in `src/rendering/Palette.ts`. Abweichungen sind nur über neue
Paletten-Einträge erlaubt, nicht über Streufarben im Code.

| Rolle | Hex |
|---|---|
| Himmel / Nebel über Wasser | `#9fb8c8` |
| Tiefe / Nebel unter Wasser | `#0b3644` |
| Wasser tief | `#14424f` |
| Wasser flach | `#3f8a96` |
| Wasserlicht (aufhellend) | `#8fb6c4` |
| Stein dunkel / hell | `#2c363d` / `#66747d` |
| Geröll / Bodenrelief | `#5a666d` / `#4a5560` |
| Sand | `#ae9c74` |
| Gold | `#d9b24a` |
| Boot-Rumpf-Tönung | `#dfe6df` |
| Dach / Reling | `#b0a890` / `#7a5c40` |
| Metall / Telefon | `#4a545c` / `#3a4a40` |
| Motor(glut) | `#7a2a20` / `#ff2a12` |
| Gefahr / Gift | `#c8452f` / `#7fff9a` |

**Eine** Sonnenrichtung für Weltlicht und Wasser:
`SONNE_RICHTUNG = (0,42 | 0,64 | 0,64)`, Intensitäten in `LICHT`.

## 4. Texel-Dichte

Gleiche Weltmeter pro Texturkachel in einer Elementklasse, damit die
Körnung überall gleich groß wirkt:

| Element | Kachel = | Datei |
|---|---|---|
| Steilküste (Wand) | ~10 m | `stone.png` |
| Seeboden (Sand) | 4 m | `sand.png` |
| Bootsrumpf | ~4 m | `boat-wall.png` |
| Deck / Holzbauten | ~1 m | `plank.png` |
| Geröll / Brocken | 1–2 m | `rock.png` |

## 5. Texturen

- Größe: Böden/Wände 256 px, Bauten 128 px; Nearest-Filter, keine
  Mipmaps.
- Motiv: aus der Nähe als Material erkennbar (Fugen, Rost, Maserung,
  Körner), aus der Ferne ruhig. Keine weichen Verläufe.
- Kontrast: harte Kanten, begrenzte Palette je Textur, Dithering statt
  Farbverlauf.
- Erzeugung: lokal und deterministisch über `tools/gen-textures.mjs`
  (kein externer Download, keine Kundendateien nötig).

## 6. Materialien

- Grundmaterial: `MeshLambertMaterial` (`texturedMat`), Farbe nur als
  Tönung (`tint`/`brightness`), kein Glanzlicht.
- Felsbrocken und Geröll sind flach schattiert (`flatShading`) und
  unregelmäßig verformt (`klumpen()`), nie gleichmäßige Würfel.
- Ein Objekt = ein Material. Keine prozeduralen Farbstreuungen außerhalb
  der Palette.

## 7. Licht und Atmosphäre

- Außen: Ambient + Hemisphere + eine gerichtete Sonne + Fülllicht
  (`World.ts`, Werte in `LICHT`).
- Unter Wasser: alle Lichter × `LICHT.unterwasserFaktor` (0,6), dichterer
  kalter Nebel (`CONFIG.world.fogBelow`) – lesbar, aber gedämpft.
- Nur die Innenräume des Boots und der Tempel haben eigenes warmes Licht.

## 8. Effekte

- **Wasser:** Wellen im Vertex-Shader, posterisierte Beleuchtung, Schaum
  über `water.png`, Beer-Lambert-Trübung über die Wassersäule.
- **Schaum:** ein Gürtel an der Wasserlinie vor der Steilküste plus
  vereinzelte Kämme auf den Wellen (Wasser-Shader, `uSeeMitte`/`uSeeRadius`).
- **Unterwasser:** „Marine Snow“ (`world/Meerespartikel.ts`) – langsam
  aufsteigende Teilchen, die dem Spieler folgen; dazu Luftblasen im
  Tiefentempel und Lichtschächte (`world/Lichtschacht.ts`), die additiv
  von der Oberfläche herabhängen.
- **Kaustik:** das wandernde Lichtnetz auf dem Seeboden. Es hängt nicht
  als eigene Fläche in der Welt, sondern wird über `onBeforeCompile` in
  die Grundmaterialien eingehängt (`rendering/Kaustik.ts`), liegt also
  exakt auf dem unebenen Grund.
- **Störung / Vignette:** siehe Abschnitt 2.
- Neue Effekte müssen die Palette nutzen und dürfen die Störung nicht
  entwerten.

## 9. Modelle

- Kreaturen und Items: mitgelieferte GLB-Modelle, nearest-gefiltert,
  einheitlich normalisiert (`rendering/Models.ts`).
- Silhouette vor Detail: aus der Ferne als Wesen erkennbar.
- Größe und Blickrichtung wie in `CONFIG` definiert.
- Prüfbild aller Modelle: Pose `katalog_modelle` (Foto-Werkzeug).

## 10. Inventar und Stand

Prüfbilder: `tools/capture.mjs` erzeugt Aufnahmen fester Kameraposen
(`src/dev/photo.ts`). Vorher/Nachher liegen unter `art/baseline/` und
`art/nachher/` (gleiche Standpunkte, Seed 1).

```bash
npm run dev          # Server starten
npm run capture      # -> art/<ordner>/…png
npm run textures     # Texturen neu erzeugen
```

| Elementklasse | Quelle | Stand |
|---|---|---|
| Steilküste + Felsen | `world/Cliffs.ts` | ✓ neu modelliert (`klumpen`), `rock.png`, in die Wand eingelassen |
| Seeboden + Geröll | `world/Seabed.ts` | ✓ `rock.png`, gedämpfte Palette, Helligkeit korrigiert |
| Texturen (Sand, Stein, Fels, Tempel, Holz, Metall, Tür, Wasser) | `tools/gen-textures.mjs` | ✓ neu erzeugt, größer, palettentreu |
| Boot (Rumpf, Deck, Räume, Brücke) | `world/Boat.ts`, `Hull.ts`, `Room.ts` | ✓ Rumpf-/Wandtönung, Palette |
| Wasser + Trübung + Schaum | `world/Ocean.ts` | ✓ Palette, Sonnenrichtung, Küsten-/Kamm-Schaum |
| Unterwasser-Teilchen + Lichtschächte | `world/Meerespartikel.ts`, `Lichtschacht.ts` | ✓ neu |
| Kaustik auf dem Seeboden | `rendering/Kaustik.ts` | ✓ neu |
| Vignette | `rendering/PixelRenderer.ts` | ✓ neu |
| Kreaturen- und Item-Modelle | `public/assets/models/*.glb` | ✓ einheitliches Lambert-Material |
| Licht/Atmosphäre | `world/World.ts`, `rendering/Palette.ts` | ✓ zentrale Palette + Sonnenrichtung |
| Tempel + Pagoden | `world/Tiefentempel.ts`, `Pagoden.ts` | ✓ `temple.png`, Säulenreihe im Umgang |
| HUD/UI | `styles/ui.css` | ✓ in Farbvariablen zentralisiert (Palette) |

Standpunkte der Prüfbilder (19): `klippen`, `klippen_fuss`, `boot_aussen`,
`boot_innen`, `boot_motorraum`, `boot_bruecke`, `oberflaeche`,
`unterwasser_flach`, `seeboden`, `tiefsee`, `riese`, `boss`, `seemonster`,
`tempel`, `umgang`, `labyrinth`, `schatz`, `katalog_modelle`,
`katalog_texturen`.

Noch offen (nächste Ausbaustufen): Modell-Detailfeinschliff der
Kreaturen, weitere Tempel-Props (Reliefs, Statuen).


