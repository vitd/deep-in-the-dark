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
    gravity: 18,
    jumpSpeed: 5.5,
    buoyancy: 2.0, // Auftrieb beim Tauchen (m/s²)
    waterAccel: 6.0, // wie schnell die Schwimmgeschwindigkeit erreicht wird
  },

  world: {
    seaLevel: 0,
    seabedY: -12,
    cliffX: -55, // Klippenwand entlang dieser x-Ebene
    boatPos: { x: -28, y: 0, z: 0 },
    spawn: { x: -38, z: 6 }, // Spieler startet schwimmend nahe der Klippen
    bounds: { minX: -54.2, maxX: 30, minZ: -80, maxZ: 80, minY: -11.4 },
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
    // Essen wird über diese Dauer animiert auf den Balken aufgeschlagen
    essenDauerSekunden: 3,
    luftDrain: 3, // pro Sekunde beim Tauchen
    luftRegen: 12.5, // pro Sekunde an der Oberfläche (0 -> 100 in 8 s)
    // Ohne Luft schwindet die Nahrung schnell; ohne Nahrung wird man langsam
    ohneLuftNahrungDrain: 5,
    erschoepftTempo: 0.5,
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
} as const;

export type Config = typeof CONFIG;
