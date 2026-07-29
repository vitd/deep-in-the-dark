import * as THREE from 'three';
import { CONFIG } from '../config';
import { CollisionWorld } from '../systems/Collision';
import { InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { UI } from '../ui/UIManager';
import { buildBoat } from './Boat';
import { buildCliffs } from './Cliffs';
import { FishManager } from './Fish';
import { LadderDef } from './Ladder';
import { Ocean } from './Ocean';
import { Resources } from './Resources';
import { BOAT_LAYOUT } from './boatLayout';

// Setzt die komplette Spielwelt zusammen und verwaltet den
// Über-/Unterwasser-Zustand (Nebel, Licht, Farbton).

export class World {
  readonly ocean: Ocean;
  readonly collision = new CollisionWorld();
  readonly ladders: LadderDef[];
  private readonly resources: Resources;
  private readonly fish: FishManager;
  // Lichter mit Basis-Intensität, damit Unterwasser einheitlich gedimmt wird
  private readonly lights: { light: THREE.Light; base: number }[] = [];
  private readonly fogColor = new THREE.Color(CONFIG.world.fogAbove.color);
  private fogDensity: number = CONFIG.world.fogAbove.density;
  private underwater = false;

  constructor(
    readonly scene: THREE.Scene,
    interaction: InteractionSystem,
    inventory: Inventory,
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

    const boat = buildBoat(scene, this.collision, interaction);
    this.ladders = boat.ladders;

    // Innenbeleuchtung der offenen Räume
    for (const def of BOAT_LAYOUT) {
      if (def.locked) continue;
      const cx = (def.min[0] + def.max[0]) / 2 + CONFIG.world.boatPos.x;
      const cz = (def.min[2] + def.max[2]) / 2 + CONFIG.world.boatPos.z;
      const light = new THREE.PointLight(0xffd9a0, 7, 8, 1.6);
      light.position.set(cx, def.max[1] - 0.4 + CONFIG.world.boatPos.y, cz);
      scene.add(light);
    }

    this.resources = new Resources(scene, this.ocean, interaction, inventory);
    this.fish = new FishManager(scene, interaction, inventory);
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

  update(dt: number): void {
    this.ocean.update(dt, this.fogColor, this.fogDensity);
    this.resources.update();
    this.fish.update(dt);
  }
}
