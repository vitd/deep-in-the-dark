import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { Interactable, InteractionSystem } from '../systems/Interaction';
import { Inventory, ItemId } from '../systems/Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

// Fische mit einfacher Wander-KI: schwimmen unter Wasser umher, ändern
// gelegentlich die Richtung, meiden das Bootsinnere. Fangen mit E;
// gefangene Fische zappeln (die-Animation) und respawnen später.
// Zwei Arten: der kleine Fisch (häufig) und der große Fisch (selten,
// tiefer unterwegs, gibt beim Essen mehr Nahrung).

const F = CONFIG.fish;

interface SpeciesDef {
  file: string;
  size: number;
  item: ItemId;
  count: number;
  respawnSeconds: number;
  minY: number;
  maxY: number;
  speedMin: number;
  speedMax: number;
}

const SPECIES: SpeciesDef[] = [
  {
    file: 'fish.glb',
    size: 0.6,
    item: 'fisch',
    count: F.count,
    respawnSeconds: F.respawnSeconds,
    minY: F.minY,
    maxY: F.maxY,
    speedMin: F.speedMin,
    speedMax: F.speedMax,
  },
  {
    file: 'fish-big.glb',
    size: CONFIG.fishBig.size,
    item: 'grossfisch',
    count: CONFIG.fishBig.count,
    respawnSeconds: CONFIG.fishBig.respawnSeconds,
    minY: CONFIG.fishBig.minY,
    maxY: CONFIG.fishBig.maxY,
    speedMin: CONFIG.fishBig.speedMin,
    speedMax: CONFIG.fishBig.speedMax,
  },
];

const BODY_COLORS = [0x6a8ea0, 0x8a9a6a, 0xa07a5a];

interface SpeciesState {
  def: SpeciesDef;
  template: THREE.Group | null;
  clips: THREE.AnimationClip[];
  respawnTimers: number[];
}

interface FishEntity {
  species: SpeciesState;
  group: THREE.Group;
  heading: number;
  speed: number;
  turnTimer: number;
  vertPhase: number;
  entry: Interactable;
  mixer?: THREE.AnimationMixer;
  // Restzeit der Sterbe-Animation nach dem Fangen; danach verschwindet er
  dying?: number;
}

// Fallback, solange (oder falls) das GLB-Modell nicht geladen ist.
function makeFallbackFishMesh(colorIdx: number, scale: number): THREE.Group {
  const color = BODY_COLORS[colorIdx % BODY_COLORS.length];
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const finMat = new THREE.MeshLambertMaterial({
    color: new THREE.Color(color).multiplyScalar(0.7),
  });
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.24, 0.55), bodyMat);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.18), finMat);
  tail.position.set(0, 0, -0.34);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.2), finMat);
  fin.position.set(0, 0.16, 0.05);
  g.add(body, tail, fin);
  g.scale.setScalar(scale / 0.6);
  return g;
}

export class FishManager {
  private readonly fishes: FishEntity[] = [];
  private readonly speciesStates: SpeciesState[];
  private spawnedTotal = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly interaction: InteractionSystem,
    private readonly inventory: Inventory,
  ) {
    this.speciesStates = SPECIES.map((def) => ({
      def,
      template: null,
      clips: [],
      respawnTimers: [],
    }));

    for (const state of this.speciesStates) {
      for (let i = 0; i < state.def.count; i++) {
        this.spawn(state, i / state.def.count);
      }
      loadModel(state.def.file, state.def.size)
        .then(({ template, clips }) => {
          // Die Fisch-Modelle schauen nach -z, unsere Bewegung nimmt +z
          // als vorwärts an: Vorlage um 180° drehen.
          template.rotation.y = Math.PI;
          state.template = template;
          state.clips = clips;
          for (const f of this.fishes) {
            if (f.species === state && f.dying === undefined) this.attachModel(f);
          }
        })
        .catch(() => {
          // Modell nicht ladbar – Box-Fische bleiben im Einsatz.
        });
    }
  }

  // Hängt das GLB-Modell (samt laufender Schwimm-Animation) an einen Fisch.
  private attachModel(fish: FishEntity): void {
    const state = fish.species;
    if (!state.template) return;
    fish.group.clear();
    const model = state.template.clone(true);
    fish.group.add(model);

    const clip = THREE.AnimationClip.findByName(state.clips, 'walk') ?? state.clips[0] ?? null;
    if (clip) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(clip);
      // Animationstempo an die individuelle Schwimmgeschwindigkeit koppeln
      const d = fish.species.def;
      action.timeScale = 0.8 + ((fish.speed - d.speedMin) / (d.speedMax - d.speedMin)) * 0.7;
      action.play();
      fish.mixer = mixer;
    }
  }

  // t (0..1) verteilt die Startpositionen deterministisch im Gebiet.
  private spawn(state: SpeciesState, t: number): void {
    const idx = this.spawnedTotal++;
    // einfache deterministische Pseudozufallswerte aus dem Index
    const r1 = ((idx * 73) % 97) / 97;
    const r2 = ((idx * 131) % 89) / 89;
    const r3 = ((idx * 37) % 71) / 71;

    const d = state.def;
    const group = new THREE.Group();
    const x = F.area.minX + (F.area.maxX - F.area.minX) * ((t + r1) % 1);
    const z = F.area.minZ + (F.area.maxZ - F.area.minZ) * r2;
    const y = d.minY + (d.maxY - d.minY) * r3;
    group.position.set(x, y, z);

    const fish: FishEntity = {
      species: state,
      group,
      heading: r1 * Math.PI * 2,
      speed: d.speedMin + (d.speedMax - d.speedMin) * r2,
      turnTimer: 2 + r3 * 4,
      vertPhase: r1 * 10,
      entry: {
        object: group,
        prompt: STR.catchFish,
        maxDistance: 2.8,
        interact: () => this.catchFish(fish),
      },
    };
    if (state.template) {
      this.attachModel(fish);
    } else {
      group.add(makeFallbackFishMesh(idx, d.size));
    }
    this.fishes.push(fish);
    this.scene.add(group);
    this.interaction.add(fish.entry);
  }

  private catchFish(fish: FishEntity): void {
    if (fish.dying !== undefined) return; // zappelt bereits
    if (!this.inventory.add(fish.species.def.item)) {
      UI.toast(STR.inventoryFull);
      return;
    }
    this.interaction.remove(fish.entry);
    fish.species.respawnTimers.push(fish.species.def.respawnSeconds);
    UI.toast(STR.pickedUp(STR.itemNames[fish.species.def.item]));

    // Sterbe-Animation aus dem GLB abspielen, dann entfernen
    const die = THREE.AnimationClip.findByName(fish.species.clips, 'die');
    if (fish.mixer && die) {
      fish.mixer.stopAllAction();
      const action = fish.mixer.clipAction(die);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      fish.dying = die.duration + 0.2;
    } else {
      fish.dying = 0.5; // Fallback-Boxfisch kippt kurz weg
    }
  }

  // Für den Debug-Teleport (?debug, Taste F)
  nearestFishPos(from: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (const f of this.fishes) {
      if (f.dying !== undefined) continue;
      const d = f.group.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = f.group.position;
      }
    }
    return best;
  }

  update(dt: number): void {
    // Respawns pro Art
    for (const state of this.speciesStates) {
      for (let i = state.respawnTimers.length - 1; i >= 0; i--) {
        state.respawnTimers[i] -= dt;
        if (state.respawnTimers[i] <= 0) {
          state.respawnTimers.splice(i, 1);
          this.spawn(state, (this.spawnedTotal % 7) / 7);
        }
      }
    }

    const dead: FishEntity[] = [];
    for (const f of this.fishes) {
      // Gefangener Fisch: zappelt, sinkt leicht ab und verschwindet dann
      if (f.dying !== undefined) {
        f.dying -= dt;
        f.mixer?.update(dt);
        f.group.position.y = Math.max(f.species.def.minY, f.group.position.y - 0.25 * dt);
        if (!f.mixer) f.group.rotation.z += 4 * dt;
        if (f.dying <= 0) {
          this.scene.remove(f.group);
          dead.push(f);
        }
        continue;
      }

      f.turnTimer -= dt;
      if (f.turnTimer <= 0) {
        f.heading += Math.sin(f.vertPhase + f.group.position.x) * 1.4;
        f.turnTimer = 2 + ((f.vertPhase * 13) % 5);
      }

      const dx = Math.sin(f.heading) * f.speed * dt;
      const dz = Math.cos(f.heading) * f.speed * dt;
      const p = f.group.position;
      const nx = p.x + dx;
      const nz = p.z + dz;

      // Gebietsgrenzen und Bootsinneres: umdrehen statt eindringen
      const outside =
        nx < F.area.minX || nx > F.area.maxX || nz < F.area.minZ || nz > F.area.maxZ;
      const inBoat =
        nx > F.avoid.minX && nx < F.avoid.maxX && nz > F.avoid.minZ && nz < F.avoid.maxZ;
      if (outside || inBoat) {
        f.heading += Math.PI * 0.9;
        continue;
      }

      p.x = nx;
      p.z = nz;
      f.vertPhase += dt;
      p.y += Math.sin(f.vertPhase * 0.8) * 0.15 * dt;
      p.y = Math.max(f.species.def.minY, Math.min(f.species.def.maxY, p.y));

      f.group.rotation.y = f.heading;
      if (f.mixer) {
        // GLB-Schwimmanimation (walk) weiterlaufen lassen
        f.mixer.update(dt);
      } else {
        // Fallback-Boxfisch: Schwanzwedeln über Rollwinkel angedeutet
        f.group.rotation.z = Math.sin(f.vertPhase * 6) * 0.08;
      }
    }

    for (const f of dead) {
      const i = this.fishes.indexOf(f);
      if (i >= 0) this.fishes.splice(i, 1);
    }
  }
}
