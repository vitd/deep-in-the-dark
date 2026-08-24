import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { MinimapMark } from '../ui/Minimap';
import { UI } from '../ui/UIManager';
import { buildBoat, HelmRef, MotorRef } from './Boat';
import { BoatController } from './BoatController';
import { BoatFrame } from './BoatFrame';
import { BossMonster } from './BossMonster';
import { buildCliffs } from './Cliffs';
import { FishManager } from './Fish';
import { LadderDef } from './Ladder';
import { Ocean } from './Ocean';
import { Resources } from './Resources';
import { Seabed } from './Seabed';
import { SeaMonster } from './SeaMonster';
import { SharkManager } from './Shark';
import { Stalker, StalkerView } from './Stalker';
import { BOAT_LAYOUT } from './boatLayout';

// Setzt die komplette Spielwelt zusammen und verwaltet den
// Über-/Unterwasser-Zustand (Nebel, Licht, Farbton).

export class World {
  readonly ocean: Ocean;
  readonly collision = new CollisionWorld();
  readonly ladders: LadderDef[];
  private readonly seabed: Seabed;
  private readonly resources: Resources;
  private readonly fish: FishManager;
  readonly shark: SharkManager;
  readonly monster: SeaMonster;
  readonly boss: BossMonster;
  readonly stalker: Stalker;
  readonly motor: MotorRef;
  readonly helm: HelmRef;
  readonly frame: BoatFrame;
  readonly boat: BoatController;
  // Boot-Gruppe in Originalkoordinaten (für Debug-Helfer u. Ä.)
  readonly boatGroup: THREE.Group;
  private readonly unlockRoom: (id: string) => boolean;
  private motorRunning = false;
  private motorBaseY = 0;
  // Schiff sinkt (vom Seemonster versenkt)
  private sinking = false;
  private sunk = false;
  readonly boatCenter = new THREE.Vector3();
  // Marken für die Minimap; die Objekte werden wiederverwendet und in
  // update() nur neu befüllt (Reihenfolge = Zeichenreihenfolge).
  readonly minimapMarks: MinimapMark[] = [
    { kind: 'ship', x: 0, z: 0, yaw: 0 },
    { kind: 'shark', x: 0, z: 0, yaw: 0 },
    { kind: 'monster', x: 0, z: 0, yaw: 0 },
    { kind: 'boss', x: 0, z: 0, yaw: 0 },
  ];
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
    onMonsterHitShip: () => void,
    onMonsterCaughtPlayer: () => void,
    onBossSurfaced: () => void,
    onBoatSwallowed: () => void,
    onStalkerJumpscare: () => void,
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
    this.seabed = new Seabed(scene, this.collision);

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
    this.shark = new SharkManager(scene, onSharkBite);
    this.monster = new SeaMonster(scene, this.frame, onMonsterHitShip, onMonsterCaughtPlayer);
    this.boss = new BossMonster(scene, onBossSurfaced, onBoatSwallowed);
    this.stalker = new Stalker(scene, onStalkerJumpscare);
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

  update(dt: number, playerPos: THREE.Vector3, playerInWater: boolean, view: StalkerView): void {
    this.ocean.update(dt, this.fogColor, this.fogDensity);
    this.seabed.update(playerPos);
    this.resources.update();
    this.boatCenter.copy(this.frame.center).add(this.frame.offset);
    // Fische und Haie streifen um den Spieler und meiden das Boot
    this.fish.update(dt, playerPos, this.boatCenter);
    this.shark.update(dt, playerPos, playerInWater, this.boatCenter);
    this.monster.update(dt, playerPos, playerInWater, this.boatCenter);
    this.boss.update(dt, this.boatCenter);
    // Der Stalker ist meistens gar nicht da – er sucht sich seine
    // Auftritte selbst (an Deck, am Himmel, unter Wasser)
    this.stalker.update(dt, view, this.boatCenter, this.frame);
    // Die Maulwände des Bosses sind undurchdringlich: notfalls wird das
    // Boot herausgedrückt und seine Pose neu angewendet
    if (this.boss.resolveBoatCollision(this.frame)) this.boat.syncPose();
    if (this.sinking && !this.sunk) {
      this.frame.offset.y -= CONFIG.seaMonster.sinkSpeed * dt;
      this.boat.syncPose();
      if (this.frame.offset.y <= CONFIG.seaMonster.sunkDepth) this.sunk = true;
    }
    this.updateMinimapMarks(playerPos);
    if (this.motorRunning) {
      // leichtes Vibrieren + pulsierendes Glühen des laufenden Motors
      const t = performance.now() / 1000;
      this.motor.group.position.y = this.motorBaseY + Math.sin(t * 55) * 0.004;
      this.motor.light.intensity = 5.2 + Math.sin(t * 9) * 1.4;
    }
  }

  // Minimap-Marken auf den aktuellen Stand bringen. Die Karte erwartet
  // die Gier-Konvention von Spieler und Boot (vorwärts = -sin/-cos);
  // die Kreaturen laufen mit +sin/+cos, ihre Marke wird deshalb um 180°
  // gedreht.
  private updateMinimapMarks(playerPos: THREE.Vector3): void {
    const [ship, shark, monster, boss] = this.minimapMarks;
    ship.x = this.boatCenter.x;
    ship.z = this.boatCenter.z;
    ship.yaw = this.frame.yaw;
    for (const [mark, obj] of [
      // von mehreren Haien zeigt die Karte den nächstgelegenen
      [shark, this.shark.nearestGroup(playerPos)],
      [monster, this.monster.group],
      [boss, this.boss.group],
    ] as const) {
      mark.x = obj.position.x;
      mark.z = obj.position.z;
      mark.yaw = obj.rotation.y + Math.PI;
    }
  }

  // Drittes Rammen des Seemonsters: das Schiff sinkt langsam weg;
  // `shipSunk` meldet, wann es endgültig unten ist.
  sinkShip(): void {
    if (this.sinking) return;
    this.sinking = true;
    this.monster.setDormant();
    this.boss.setDormant();
  }

  get shipSunk(): boolean {
    return this.sunk;
  }

  startMotor(): void {
    if (this.motorRunning) return;
    this.motorRunning = true;
    this.motorBaseY = this.motor.group.position.y;
    this.motor.setRunning();
  }
}
