// Zentrale Stellschrauben des Spiels. Änderungen am Spielgefühl,
// an der Optik oder an der Welt zuerst hier versuchen.

export interface WaveDef {
  dirX: number;
  dirZ: number;
  freq: number;
  amp: number;
  speed: number;
}

export const CONFIG = {
  render: {
    // Interne Renderauflösung; wird nearest-neighbor hochskaliert.
    width: 480,
    height: 270,
    // Farb-Posterisierung im Upscale-Shader (0 = aus).
    posterizeLevels: 22,
    dither: true,
    farPlane: 300,
  },

  player: {
    radius: 0.35,
    height: 1.7,
    eyeHeight: 1.55,
    walkSpeed: 4.2,
    swimSpeed: 3.0,
    diveSpeed: 2.7,
    climbSpeed: 1.9,
    // Leiter: Umkreis um den Leiter-Standpunkt, in dem automatisch
    // gegriffen wird. Die Kletterrichtung kommt aus der Blickneigung:
    // bis zur Totzone passiert nichts, ab `climbLookFull` volle Fahrt.
    climbGrabRadius: 0.9,
    climbLookDeadzone: 0.15,
    climbLookFull: 0.55,
    gravity: 18,
    jumpSpeed: 5.5,
    waterAccel: 6.0, // wie schnell die Schwimmgeschwindigkeit erreicht wird
  },

  world: {
    seaLevel: 0,
    seabedY: -12, // Bodentiefe an der Küste (Küstenschelf)
    boatPos: { x: -28, y: 0, z: 0 },
    spawn: { x: -38, z: 6 }, // Spieler startet schwimmend nahe der Klippen
    // Die Spielwelt ist ein kreisrunder See mit Steilküste ringsum.
    // Der Kreis verläuft durch die alte Westküsten-Linie (x = -55 bei
    // z = 0): center.x = -55 + radius. Tiefenprofil: die äußeren
    // `shelfWidth` Meter sind eben so tief wie `seabedY`, zur Seemitte
    // fällt der Boden parabelförmig auf `centerDepth` ab
    // (siehe world/lake.ts).
    lake: {
      center: { x: 945, z: 0 },
      radius: 1000, // 2 km Durchmesser
      centerDepth: 100,
      shelfWidth: 150,
    },
    fogAbove: { color: 0x9fb8c8, density: 0.011 },
    fogBelow: { color: 0x0b3644, density: 0.075 },
    // Durchsicht durch die Wasseroberfläche von oben (Schwimmer an der
    // Oberfläche, Deck des Schiffs). Der Grund darf nur im flachen
    // Küstenwasser durchscheinen – draußen über der Tiefe wäre ein
    // sichtbarer Seeboden weder plausibel noch atmosphärisch gewollt.
    waterClarity: {
      max: 0.35, // Durchsicht direkt am Ufer (Wassertiefe 0)
      murk: 0.09, // Trübung je Meter Wassersäule (Beer-Lambert)
      opaqueDepth: 30, // ab dieser Tiefe ist die Oberfläche völlig dicht
    },
    skyAbove: 0x9fb8c8,
    skyBelow: 0x0b3644,
  },

  waves: [
    { dirX: 1.0, dirZ: 0.25, freq: 0.32, amp: 0.13, speed: 1.1 },
    { dirX: -0.4, dirZ: 0.9, freq: 0.5, amp: 0.08, speed: 1.6 },
    { dirX: 0.7, dirZ: -0.7, freq: 0.9, amp: 0.045, speed: 2.3 },
    { dirX: 0.2, dirZ: 1.0, freq: 1.7, amp: 0.02, speed: 3.1 },
  ] as WaveDef[],

  interact: {
    maxDistance: 3.2,
  },

  // Minimap oben rechts (src/ui/Minimap.ts)
  minimap: {
    radius: 100, // abgedeckter Radius in Metern
    pixel: 120, // interne Auflösung; wird per CSS pixelig hochskaliert
  },

  stats: {
    // Nahrungsverbrauch pro Sekunde: nur in Bewegung, 1 Punkt / 10 s
    nahrungDrain: { idle: 0, walk: 0.1, swim: 0.1, dive: 0.1, climb: 0.1 },
    nahrungProFisch: 35,
    nahrungProGrossfisch: 70,
    nahrungProKonserve: 25, // Item "Nahrung" aus Fässern
    // Essen wird über diese Dauer animiert auf den Balken aufgeschlagen
    essenDauerSekunden: 3,
    luftDrain: 3, // pro Sekunde beim Tauchen
    luftRegen: 12.5, // pro Sekunde an der Oberfläche (0 -> 100 in 8 s)
    // Ohne Luft schwindet die Nahrung schnell; ohne Nahrung wird man langsam
    ohneLuftNahrungDrain: 5,
    erschoepftTempo: 0.5,
    // Sicht-Effekte und Ertrinken bei Luftnot
    luftVignetteAb: 25, // Vignette wird ab diesem Wert stärker
    luftUnschaerfeAb: 10, // Bild wird ab diesem Wert unscharf
    ertrinkenSekunden: 10, // Countdown bei Luft 0
  },

  // Fische und Haie bevölkern den ganzen See (2 km Durchmesser). Statt
  // Tausender fester Tiere lebt immer nur eine Schar in der Umgebung des
  // Spielers: Wer weit genug zurückfällt, wird vor dem Spieler neu
  // eingesetzt. Dadurch findet man überall Fang, ohne die Bildrate zu
  // ruinieren. Werte in `revier` gelten für beide Arten.
  revier: {
    spawnMin: 22, // Abstand zum Spieler beim Einsetzen (Fische)
    spawnMax: 70,
    despawnRadius: 120, // weiter entfernt: woanders neu einsetzen
    uferAbstand: 15, // Mindestabstand zur Steilküste
    bodenAbstand: 2.0, // Mindestabstand über dem Seeboden
    bootAbstand: 12, // Umkreis um das Boot, den Tiere meiden
  },

  fish: {
    count: 14, // gleichzeitig in der Umgebung des Spielers
    respawnSeconds: 25,
    minY: -10.5,
    maxY: -1.6,
    speedMin: 0.7,
    speedMax: 1.5,
  },

  // Haie: mehrere, über den ganzen See verteilt, nur im Wasser gefährlich
  shark: {
    count: 3, // gleichzeitig in der Umgebung des Spielers
    size: 3.2,
    speed: 3.4, // Angriffs-Tempo
    patrolSpeed: 1.1,
    aggroRadius: 15, // ab dieser Distanz nimmt er den Spieler ins Visier
    attackRange: 1.8, // Biss-Distanz
    swingRange: 3.0, // Reichweite des Hammerschlags
    damage: 30,
    retreatSeconds: 6, // Pause nach einem Biss
    repelSeconds: 18, // Pause nach Hammer-Abwehr
    minY: -10,
    maxY: -1.0,
    cruiseY: -6, // bevorzugte Patrouillentiefe
    // Haie tauchen weiter entfernt auf als Fische – sie sollen nicht
    // direkt neben dem Spieler erscheinen
    spawnMin: 55,
    spawnMax: 130,
    despawnRadius: 220,
  },

  // Das Seemonster: haust weit draußen auf dem offenen Meer. Schwimmer
  // ohne Waffe/Schutz tötet es sofort; das Schiff greift es an und
  // versenkt es nach `shipHits` Treffern.
  seaMonster: {
    size: 12, // ca. halbe Rumpflänge (Rumpf ist 24 m lang)
    patrolSpeed: 1.6,
    attackSpeed: 8, // schneller als das Boot (boot.maxSpeed)
    aggroRadius: 45,
    killRange: 3.0, // Distanz, ab der ein Schwimmer erwischt ist
    shipHitRange: 6.5, // Abstand Monsterzentrum zur Rumpf-Außenkante
    shipHits: 3, // so viele Rammstöße versenken das Schiff
    retreatSeconds: 6, // Pause nach einem Rammstoß
    // Es schwimmt an der Oberfläche – Rücken und Kopf ragen aus dem
    // Wasser, vom Steuerstand aus sichtbar. Nur zum Rammen bzw. bei der
    // Jagd auf Taucher geht es unter Wasser (minY).
    cruiseY: -0.5,
    attackY: -2.5, // beim Rammstoß taucht es unter die Wasserlinie
    minY: -9,
    maxY: -0.2,
    // Revier weit draußen: ein Gürtel quer über den Weg von der
    // Westküste (Boot startet bei x = -28) zum Boss-Nest (x = 700)
    territory: { minX: 250, maxX: 480, minZ: -350, maxZ: 350 },
    chaseMargin: 40, // so weit verfolgt es Ziele über das Revier hinaus
    spawn: { x: 350, y: -0.5, z: 0 },
    sinkSpeed: 1.4, // m/s, mit denen das getroffene Schiff absinkt
    sunkDepth: -9, // ab dieser Absenkung gilt das Schiff als gesunken
  },

  // Der Boss: ein kolossales Maul-Monster, das sehr weit draußen unter
  // Wasser lauert. Kommt das Boot in die Nähe, eilt es in der Tiefe zu
  // einem Punkt neben dem Schiff, durchbricht dort senkrecht (Maul nach
  // oben) die Oberfläche, rollt auf den Bauch – und nimmt erst dann Kurs
  // aufs Boot, um es zu verschlucken. Verschluckt ist das Boot erst,
  // wenn es die schwarze Schlundwand hinten im Maul berührt.
  seaBoss: {
    // Skalierung: Maulöffnung ~52 m im Quadrat, Maultiefe ~68 m – das
    // Boot (24 m) verschwindet komplett darin. Die Maulwände sind
    // undurchdringlich (siehe BossMonster.resolveBoatCollision).
    size: 180,
    // Nest sehr weit von der Küste entfernt, im tiefen Teil des Sees
    // (Seemitte bei x = 945, dort ~100 m Tiefe)
    nest: { x: 700, z: 0 },
    lurkY: -80, // Lauertiefe (der Boden liegt dort bei ca. -90 m)
    surfaceY: 2, // in Bauchlage: Maul ragt weit aus dem Wasser
    riseSpeed: 9, // m/s beim senkrechten Auf-/Abtauchen
    approachSpeed: 14, // Anlauf in der Tiefe zum Auftauchpunkt
    // Auftauchpunkt: Abstand vom Bootszentrum. Muss größer sein als die
    // halbe Körperlänge (90 m) plus Boot, damit das Maul beim Abrollen
    // auf den Bauch VOR dem Boot ins Wasser klatscht – es taucht also
    // garantiert neben dem Schiff auf, nie darunter
    emergeDistance: 130,
    // Körpermitte am Scheitel des senkrechten Durchbruchs: das Maul
    // (90 m vor der Mitte) ragt dann 60 m aus dem Wasser
    breachY: -30,
    rollSpeed: 0.6, // rad/s beim Kippen aus der Senkrechten in die Bauchlage
    // Tempo an der Oberfläche (Bauchlage, Jagd auf das Boot): 25 %
    // langsamer als früher (6.5) – damit bleibt er unter der Bootsfahrt
    // (boot.maxSpeed 6), gefährlich wird er nur bei kurzem Abstand oder
    // wenn man sich verfährt
    chaseSpeed: 4.875,
    patrolSpeed: 2, // Rückkehr zum Nest
    // Wendigkeit: sehr träge, nicht einmal ein Drittel der Bootsdrehrate
    // (boot.turnRate 0.55). Für 90° braucht der Koloss rund 10 s – in
    // der Zeit ist ein quer abdrehendes Boot längst aus der Maulachse
    turnRate: 0.15,
    triggerRadius: 115,
    giveUpRadius: 180, // Bootsabstand zum Boss-Zentrum, ab dem es aufgibt
    schlundMarge: 6, // Restabstand Bootszentrum zur Schlundwand = Berührung
    // Ist das Boot im Maul, setzt der Boss zum Zubeißen an: er dreht
    // nicht mehr und wird langsamer – wer sofort wendet und Vollgas
    // gibt, kann durch die Öffnung entkommen
    maulTempoFaktor: 0.45,
  },

  // Großer Fisch: seltener, tiefer, ergiebiger
  fishBig: {
    count: 3,
    respawnSeconds: 120,
    minY: -10.5,
    maxY: -6,
    speedMin: 0.5,
    speedMax: 0.9,
    size: 1.35,
  },

  inventory: {
    slots: 12,
    maxStack: 16,
  },

  // Fässer und Treibstoff
  barrels: {
    // Zerlegen an der Werkbank: feste Ausbeute + Zufallsinhalt (0..max)
    fixedYield: { holzplanke: 4, eisen: 4 },
    randomLoot: { nyzerin: 3, glyzerin: 3, gold: 3, stein: 5, nahrung: 6, plastik: 11 },
    // Treibstofffass (selten): zufällige Füllung in Litern
    fuelMaxLiter: 76,
  },

  // Fahrverhalten des Boots (Steuerstand auf der Brücke)
  boot: {
    maxSpeed: 6, // Vorausfahrt in m/s bei vollem Hebel
    rueckSpeed: 2.2, // Rückwärtsfahrt
    accel: 0.8, // Annäherungsrate an die Zielgeschwindigkeit
    turnRate: 0.55, // rad/s bei vollem Einschlag und voller Fahrt
    leverRate: 1.2, // Hebelweg pro Sekunde (W/S)
    wheelRate: 1.5, // Steuerrad-Einschlag pro Sekunde (A/D)
    // ohne A/D dreht das Rad von selbst zurück – das Schiff fährt geradeaus
    wheelReturnRate: 2.2,
    // Mindestabstand des Bootszentrums zur Steilküste (halbe Rumpflänge
    // plus Marge; geklemmt wird kreisförmig, siehe world/lake.ts)
    shoreMargin: 20,
    // Third-Person-Kamera am Steuer: kreist um den Steuerstand
    kameraDistanz: 20,
    kameraPivotHoehe: 2.5, // Orbit-Mittelpunkt über dem Steuerstand-Boden
    kameraStartPitch: -0.45, // Einstieg: schräg von oben in Fahrtrichtung
    kameraPitchMin: -1.35, // fast senkrecht von oben
    kameraPitchMax: -0.08, // nie unter die Wasserlinie
  },

  // Taucherhelm: HUD-Bild, das sich über die ganze Sicht legt, sobald
  // der Helm getragen wird. Das Rezept kommt später – bis dahin setzt
  // ihn das Cheat-Menü (Taste L) auf und justiert ihn per Tastatur.
  taucherhelm: {
    bild: 'assets/hud/helmet.png',
    // 'strecken': auf das Bildschirmformat gezogen (nichts wird
    // beschnitten) · 'quadrat': formtreu, oben/unten beschnitten
    modus: 'strecken',
    skalierung: 1, // 1 = füllt den Bildschirm genau aus
    versatzX: 0, // in % der Bildschirmbreite
    versatzY: 0, // in % der Bildschirmhöhe
    deckkraft: 1,
    pixelig: true, // Nearest-Neighbor, passt zum Pixel-Look
    // Füllfarbe außerhalb des Bildes (Messingrand des Helms), damit bei
    // kleiner Skalierung kein Loch am Bildschirmrand entsteht
    randfarbe: '#a76100',
  },

  // Materialbedarf der Motor-Reparatur (Mechanik folgt)
  motorRepair: {
    eisen: 50,
    gold: 50,
    nyzerin: 20,
    glyzerin: 20,
    treibstoffLiter: 100,
  },
} as const;

export type Config = typeof CONFIG;
