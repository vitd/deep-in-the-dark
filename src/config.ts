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
    seabedY: -12,
    cliffX: -55, // Klippenwand entlang dieser x-Ebene
    boatPos: { x: -28, y: 0, z: 0 },
    spawn: { x: -38, z: 6 }, // Spieler startet schwimmend nahe der Klippen
    // weit genug für Bootsfahrten aufs offene Meer (siehe boot.bounds)
    bounds: { minX: -54.2, maxX: 130, minZ: -160, maxZ: 160, minY: -11.4 },
    fogAbove: { color: 0x9fb8c8, density: 0.011 },
    fogBelow: { color: 0x0b3644, density: 0.075 },
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

  fish: {
    count: 12,
    respawnSeconds: 60,
    minY: -10.5,
    maxY: -1.6,
    speedMin: 0.7,
    speedMax: 1.5,
    // bewusst kompakt: der Bereich zwischen Klippen und Boot, wo der
    // Spieler unterwegs ist – so begegnet man den Fischen wirklich
    area: { minX: -52, maxX: -10, minZ: -35, maxZ: 35 },
    // Fische meiden das Bootsinnere
    avoid: { minX: -33.5, maxX: -22.5, minZ: -16, maxZ: 13 },
  },

  // Der Hai: einer, aggressiv, nur im Wasser gefährlich
  shark: {
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
    spawn: { x: -46, y: -6, z: -22 },
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
    // Revier weit draußen (Boot startet bei x = -28, Klippen im Westen)
    territory: { minX: 25, maxX: 118, minZ: -145, maxZ: 145 },
    chaseMargin: 25, // so weit verfolgt es Ziele über das Revier hinaus
    spawn: { x: 75, y: -0.5, z: 0 },
    sinkSpeed: 1.4, // m/s, mit denen das getroffene Schiff absinkt
    sunkDepth: -9, // ab dieser Absenkung gilt das Schiff als gesunken
  },

  // Der Boss: ein kolossales Maul-Monster, das sehr weit draußen unter
  // Wasser lauert. Kommt das Boot in die Nähe, taucht es auf und
  // versucht, das Boot zu verschlucken. Verschluckt ist das Boot erst,
  // wenn es die schwarze Schlundwand hinten im Maul berührt.
  seaBoss: {
    // Skalierung: Maulöffnung ~27 m im Quadrat – das Boot (24 m) passt
    // der Länge nach quer hinein; Maultiefe ~34 m
    size: 90,
    // Nest sehr weit von der Küste entfernt (Klippen bei x = -55)
    nest: { x: 100, z: 0 },
    lurkY: -38, // Lauertiefe (dort gibt es keinen Meeresboden mehr)
    surfaceY: 2, // aufgetaucht: Maul ragt ~16 m aus dem Wasser
    riseSpeed: 7, // m/s beim Auf-/Abtauchen
    chaseSpeed: 7.5, // schneller als das Boot (boot.maxSpeed)
    patrolSpeed: 2, // Rückkehr zum Nest
    turnRate: 0.35, // rad/s – träge, quer abdrehen kann retten
    triggerRadius: 65, // Bootsabstand zum Nest, ab dem es auftaucht
    giveUpRadius: 140, // Bootsabstand zum Boss, ab dem es aufgibt
    // Schlundwand: 1.48 Modell-Einheiten vor dem Zentrum (Modell 12 lang)
    // -> bei size 90: 1.48 * 90/12 = 11.1 m in Maulrichtung
    throatOffset: 11.1,
    swallowRadius: 10, // Bootszentrum so nah an der Schlundwand = verschluckt
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
    // Fahrbereich des Bootszentrums (Klippen im Westen, Kartenrand sonst)
    bounds: { minX: -36, maxX: 120, minZ: -150, maxZ: 150 },
    // Third-Person-Kamera am Steuer: kreist um den Steuerstand
    kameraDistanz: 20,
    kameraPivotHoehe: 2.5, // Orbit-Mittelpunkt über dem Steuerstand-Boden
    kameraStartPitch: -0.45, // Einstieg: schräg von oben in Fahrtrichtung
    kameraPitchMin: -1.35, // fast senkrecht von oben
    kameraPitchMax: -0.08, // nie unter die Wasserlinie
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
