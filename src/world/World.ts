import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { UI } from '../ui/UIManager';
import { buildBoat, HelmRef, MotorRef } from './Boat';
import { BoatController } from './BoatController';
import { BoatFrame } from './BoatFrame';
import { buildCliffs } from './Cliffs';
import { FishManager } from './Fish';
import { LadderDef } from './Ladder';
import { Ocean } from './Ocean';
import { Resources } from './Resources';
import { Shark } from './Shark';
import { BOAT_LAYOUT } from './boatLayout';

// Setzt die komplette Spielwelt zusammen und verwaltet den
// Über-/Unterwasser-Zustand (Nebel, Licht, Farbton).

export class World {
  readonly ocean: Ocean;
  readonly collision = new CollisionWorld();
  readonly ladders: LadderDef[];
  private readonly resources: Resources;
  private readonly fish: FishManager;
  readonly shark: Shark;
  readonly motor: MotorRef;
  readonly helm: HelmRef;
  readonly frame: BoatFrame;
  readonly boat: BoatController;
  // Boot-Gruppe in Originalkoordinaten (für Debug-Helfer u. Ä.)
  readonly boatGroup: THREE.Group;
  private readonly unlockRoom: (id: string) => boolean;
  private motorRunning = false;
  private motorBaseY = 0;
  // Lichter mit Basis-Intensität, damit Unterwasser einheitlich gedimmt wird
  private readonly lights: { light: THREE.Light; base: number }[] = [];
  private readonly fogColor = new THREE.Color(CONFIG.world.fogAbove.color);
  private fogDensity: number = CONFIG.world.fogAbove.density;
  private underwater = false;

  constructor(
    readonly scene: THREE.Scene,
    interaction: InteractionSystem,
    inventory: Inventory,
    onCraftingTable: () => void,
    onSharkBite: () => void,
    onFuelFound: (liter: number) => void,
    motorPrompt: () => string,
    onMotorInteract: () => void,
    helmPrompt: () => string,
    onHelmInteract: () => void,
  ) {
    scene.background = new THREE.Color(CONFIG.world.skyAbove);
    scene.fog = new THREE.FogExp2(CONFIG.world.fogAbove.color, CONFIG.world.fogAbove.density);

    const ambient = new THREE.AmbientLight(0xbfd4dc, 0.5);
    const hemi = new THREE.HemisphereLight(0xcfe0e8, 0x54483c, 0.7);
    const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
    sun.position.set(30, 60, 20);
    // Fülllicht von der sonnenabgewandten Seite, damit keine Fläche absäuft
    const fill = new THREE.DirectionalLight(0xbfd0d8, 0.8);
    fill.position.set(-40, 25, -15);
    for (const l of [ambient, hemi, sun, fill]) {
      scene.add(l);
      this.lights.push({ light: l, base: l.intensity });
    }

    this.ocean = new Ocean();
    scene.add(this.ocean.mesh);

    buildCliffs(scene, this.collision);

    const boat = buildBoat(scene, this.collision, interaction, inventory, {
      onCraftingTable,
      motorPrompt,
      onMotorInteract,
      helmPrompt,
      onHelmInteract,
    });
    this.motor = boat.motor;
    this.helm = boat.helm;
    this.ladders = boat.ladders;
    this.boatGroup = boat.group;
    this.unlockRoom = boat.unlock;

    // Fahr-Rahmen: verbindet Bootsbewegung und Kollisionswelt
    this.frame = new BoatFrame(
      new THREE.Vector3(CONFIG.world.boatPos.x, CONFIG.world.boatPos.y, CONFIG.world.boatPos.z),
    );
    this.collision.frame = this.frame;
    this.boat = new BoatController(this.frame, boat.pivot, boat.helm);

    // Innenbeleuchtung der offenen Räume – hängt am Boot, damit sie
    // bei Fahrten mitwandert
    for (const def of BOAT_LAYOUT) {
      if (def.locked) continue;
      this.addRoomLight(def.min, def.max);
    }

    this.resources = new Resources(scene, this.ocean, interaction, inventory, onFuelFound, boat.group);
    this.fish = new FishManager(scene, interaction, inventory);
    this.shark = new Shark(scene, onSharkBite);
  }

  private addRoomLight(min: readonly number[], max: readonly number[]): void {
    const b = CONFIG.world.boatPos;
    const light = new THREE.PointLight(0xffd9a0, 7, 8, 1.6);
    light.position.set(
      (min[0] + max[0]) / 2 + b.x,
      max[1] - 0.4 + b.y,
      (min[2] + max[2]) / 2 + b.z,
    );
    this.boatGroup.add(light);
  }

  // Motor läuft: Brücke aufschließen und beleuchten
  unlockBruecke(): boolean {
    const def = BOAT_LAYOUT.find((d) => d.id === 'bruecke');
    if (!def || !this.unlockRoom('bruecke')) return false;
    this.addRoomLight(def.min, def.max);
    return true;
  }

  // Aktuelle Weltposition des Steuermann-Standpunkts
  helmStandWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.frame.toWorld(out.copy(this.helm.stand));
  }

  setUnderwater(under: boolean): void {
    if (under === this.underwater) return;
    this.underwater = under;
    const fog = under ? CONFIG.world.fogBelow : CONFIG.world.fogAbove;
    const sky = under ? CONFIG.world.skyBelow : CONFIG.world.skyAbove;
    this.fogColor.set(fog.color);
    this.fogDensity = fog.density;
    (this.scene.fog as THREE.FogExp2).color.set(fog.color);
    (this.scene.fog as THREE.FogExp2).density = fog.density;
    (this.scene.background as THREE.Color).set(sky);
    for (const { light, base } of this.lights) {
      light.intensity = under ? base * 0.45 : base;
    }
    UI.setVisible(UI.underwater, under);
  }

  nearestFishPos(from: THREE.Vector3): THREE.Vector3 | null {
    return this.fish.nearestFishPos(from);
  }

  update(dt: number, playerPos: THREE.Vector3, playerInWater: boolean): void {
    this.ocean.update(dt, this.fogColor, this.fogDensity);
    this.resources.update();
    this.fish.update(dt);
    this.shark.update(dt, playerPos, playerInWater);
    if (this.motorRunning) {
      // leichtes Vibrieren + pulsierendes Glühen des laufenden Motors
      const t = performance.now() / 1000;
      this.motor.group.position.y = this.motorBaseY + Math.sin(t * 55) * 0.004;
      this.motor.light.intensity = 5.2 + Math.sin(t * 9) * 1.4;
    }
  }

  startMotor(): void {
    if (this.motorRunning) return;
    this.motorRunning = true;
    this.motorBaseY = this.motor.group.position.y;
    this.motor.setRunning();
  }
}
