import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CONFIG } from '../config';
import { Interactable, InteractionSystem } from '../systems/Interaction';
import { Inventory } from '../systems/Inventory';
import { STR } from '../ui/strings.de';
import { UI } from '../ui/UIManager';

// Fische mit einfacher Wander-KI: schwimmen unter Wasser umher, ändern
// gelegentlich die Richtung, meiden das Bootsinnere. Fangen mit E;
// gefangene Fische respawnen nach einiger Zeit an neuer Position.

const F = CONFIG.fish;

const BODY_COLORS = [0x6a8ea0, 0x8a9a6a, 0xa07a5a];

interface FishEntity {
  group: THREE.Group;
  heading: number;
  speed: number;
  turnTimer: number;
  vertPhase: number;
  entry: Interactable;
  mixer?: THREE.AnimationMixer;
}

// Fallback, solange (oder falls) das GLB-Modell nicht geladen ist:
// grober Box-Fisch. Blickrichtung ist +z.
function makeFallbackFishMesh(colorIdx: number): THREE.Group {
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
  return g;
}

// Lädt das Fisch-Modell des Kunden und normalisiert es: zentriert,
// auf Spiellänge skaliert, Texturen nearest-gefiltert (Pixel-Look).
// Liefert auch die im GLB enthaltenen Animationen (idle/walk/die).
function loadFishTemplate(
  onReady: (template: THREE.Group, clips: THREE.AnimationClip[]) => void,
): void {
  new GLTFLoader().load(
    'assets/models/fish.glb',
    (gltf) => {
      const inner = gltf.scene;
      inner.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          const std = mat as THREE.MeshStandardMaterial;
          if (std.map) {
            std.map.magFilter = THREE.NearestFilter;
            std.map.minFilter = THREE.NearestFilter;
            std.map.needsUpdate = true;
          }
        }
      });
      const box = new THREE.Box3().setFromObject(inner);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      inner.position.sub(center);
      const template = new THREE.Group();
      template.add(inner);
      const maxDim = Math.max(size.x, size.y, size.z, 0.0001);
      template.scale.setScalar(0.6 / maxDim);
      onReady(template, gltf.animations);
    },
    undefined,
    () => {
      // Modell nicht ladbar – Box-Fische bleiben im Einsatz.
    },
  );
}

export class FishManager {
  private readonly fishes: FishEntity[] = [];
  private readonly respawnTimers: number[] = [];
  private spawnedTotal = 0;
  private template: THREE.Group | null = null;
  private clips: THREE.AnimationClip[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly interaction: InteractionSystem,
    private readonly inventory: Inventory,
  ) {
    for (let i = 0; i < F.count; i++) {
      this.spawn(i / F.count);
    }
    loadFishTemplate((template, clips) => {
      this.template = template;
      this.clips = clips;
      // bereits schwimmende Box-Fische auf das Modell umrüsten
      for (const f of this.fishes) {
        this.attachModel(f);
      }
    });
  }

  // Hängt das GLB-Modell (samt laufender Schwimm-Animation) an einen Fisch.
  private attachModel(fish: FishEntity): void {
    if (!this.template) return;
    fish.group.clear();
    const model = this.template.clone(true);
    fish.group.add(model);

    const clip =
      THREE.AnimationClip.findByName(this.clips, 'walk') ?? this.clips[0] ?? null;
    if (clip) {
      const mixer = new THREE.AnimationMixer(model);
      const action = mixer.clipAction(clip);
      // Animationstempo an die individuelle Schwimmgeschwindigkeit koppeln
      action.timeScale =
        0.8 + ((fish.speed - F.speedMin) / (F.speedMax - F.speedMin)) * 0.7;
      action.play();
      fish.mixer = mixer;
    }
  }

  // t (0..1) verteilt die Startpositionen deterministisch im Gebiet.
  private spawn(t: number): void {
    const idx = this.spawnedTotal++;
    // einfache deterministische Pseudozufallswerte aus dem Index
    const r1 = ((idx * 73) % 97) / 97;
    const r2 = ((idx * 131) % 89) / 89;
    const r3 = ((idx * 37) % 71) / 71;

    const group = new THREE.Group();
    const x = F.area.minX + (F.area.maxX - F.area.minX) * ((t + r1) % 1);
    const z = F.area.minZ + (F.area.maxZ - F.area.minZ) * r2;
    const y = F.minY + (F.maxY - F.minY) * r3;
    group.position.set(x, y, z);

    const fish: FishEntity = {
      group,
      heading: r1 * Math.PI * 2,
      speed: F.speedMin + (F.speedMax - F.speedMin) * r2,
      turnTimer: 2 + r3 * 4,
      vertPhase: r1 * 10,
      entry: {
        object: group,
        prompt: STR.catchFish,
        maxDistance: 2.8,
        interact: () => this.catchFish(fish),
      },
    };
    if (this.template) {
      this.attachModel(fish);
    } else {
      group.add(makeFallbackFishMesh(idx));
    }
    this.fishes.push(fish);
    this.scene.add(group);
    this.interaction.add(fish.entry);
  }

  private catchFish(fish: FishEntity): void {
    if (!this.inventory.add('fisch')) {
      UI.toast(STR.inventoryFull);
      return;
    }
    this.scene.remove(fish.group);
    this.interaction.remove(fish.entry);
    const i = this.fishes.indexOf(fish);
    if (i >= 0) this.fishes.splice(i, 1);
    this.respawnTimers.push(F.respawnSeconds);
    UI.toast(STR.pickedUp(STR.itemNames.fisch));
  }

  // Für den Debug-Teleport (?debug, Taste F)
  nearestFishPos(from: THREE.Vector3): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = Infinity;
    for (const f of this.fishes) {
      const d = f.group.position.distanceToSquared(from);
      if (d < bestDist) {
        bestDist = d;
        best = f.group.position;
      }
    }
    return best;
  }

  update(dt: number): void {
    // Respawns
    for (let i = this.respawnTimers.length - 1; i >= 0; i--) {
      this.respawnTimers[i] -= dt;
      if (this.respawnTimers[i] <= 0) {
        this.respawnTimers.splice(i, 1);
        this.spawn((this.spawnedTotal % 7) / 7);
      }
    }

    for (const f of this.fishes) {
      f.turnTimer -= dt;
      if (f.turnTimer <= 0) {
        f.heading += (Math.sin(f.vertPhase + f.group.position.x) * 1.4);
        f.turnTimer = 2 + ((f.vertPhase * 13) % 5);
      }

      const dx = Math.sin(f.heading) * f.speed * dt;
      const dz = Math.cos(f.heading) * f.speed * dt;
      const p = f.group.position;
      let nx = p.x + dx;
      let nz = p.z + dz;

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
      p.y = Math.max(F.minY, Math.min(F.maxY, p.y));

      f.group.rotation.y = f.heading;
      if (f.mixer) {
        // GLB-Schwimmanimation (walk) weiterlaufen lassen
        f.mixer.update(dt);
      } else {
        // Fallback-Boxfisch: Schwanzwedeln über Rollwinkel angedeutet
        f.group.rotation.z = Math.sin(f.vertPhase * 6) * 0.08;
      }
    }
  }
}
