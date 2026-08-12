import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';

// Der Boss: ein kolossales Maul-Monster (seamonster-boss.glb – ein
// vorne offener, innen schwarzer Schlund), das sehr weit draußen auf
// dem offenen Meer unter Wasser lauert. Kommt das Boot seinem Nest zu
// nahe, taucht es auf und schiebt sein Maul über das Boot. Verschluckt
// ist das Boot erst, wenn es die schwarze Schlundwand hinten im Maul
// berührt – solange kann man noch hinausfahren.

const B = CONFIG.seaBoss;

type BossState = 'lurk' | 'rise' | 'attack' | 'descend' | 'return';

export class BossMonster {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private state: BossState = 'lurk';
  private heading = 0;
  // Schiff gesunken/verschluckt: nichts mehr zu jagen
  private dormant = false;
  private warned = false;
  private readonly tmp = new THREE.Vector3();
  private readonly throat = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    private readonly onSurfaced: () => void,
    private readonly onBoatSwallowed: () => void,
  ) {
    this.group.position.set(B.nest.x, B.lurkY, B.nest.z);
    scene.add(this.group);
    loadModel('seamonster-boss.glb', B.size)
      .then(({ template, clips }) => {
        // Maulöffnung zeigt im GLB nach -z; Bewegung nimmt +z als vorwärts an
        template.rotation.y = Math.PI;
        const model = template.clone(true);
        this.group.add(model);
        this.mixer = new THREE.AnimationMixer(model);
        const clip = THREE.AnimationClip.findByName(clips, 'walk');
        if (clip) this.mixer.clipAction(clip).play();
      })
      .catch(() => {
        // Fallback: offener dunkler Kasten in Bossgröße
        const s = B.size * 0.3;
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(s, s, B.size * 0.6),
          new THREE.MeshLambertMaterial({ color: 0x101418, side: THREE.DoubleSide }),
        );
        this.group.add(body);
      });
  }

  setDormant(): void {
    this.dormant = true;
    if (this.state === 'attack') this.state = 'descend';
  }

  // Weltposition der Schlundwand (hinten im Maul, in Maulrichtung vorn)
  private throatPoint(out: THREE.Vector3): THREE.Vector3 {
    return out
      .copy(this.group.position)
      .add(this.forward(this.tmp).multiplyScalar(B.throatOffset));
  }

  private forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // Träge Drehung zum Ziel-Heading
  private turnTowards(target: number, dt: number): void {
    let d = target - this.heading;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const step = B.turnRate * dt;
    this.heading += Math.abs(d) <= step ? d : Math.sign(d) * step;
  }

  update(dt: number, boatCenter: THREE.Vector3): void {
    this.mixer?.update(dt);
    const pos = this.group.position;
    const distBoatNest = Math.hypot(boatCenter.x - B.nest.x, boatCenter.z - B.nest.z);
    const distBoatBoss = Math.hypot(boatCenter.x - pos.x, boatCenter.z - pos.z);

    switch (this.state) {
      case 'lurk': {
        if (!this.dormant && distBoatNest < B.triggerRadius) {
          this.state = 'rise';
          if (!this.warned) {
            this.warned = true;
            this.onSurfaced();
          }
        }
        break;
      }

      case 'rise': {
        // aufs Boot ausrichten, während es aufsteigt
        this.turnTowards(Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z), dt);
        pos.y = Math.min(B.surfaceY, pos.y + B.riseSpeed * dt);
        if (pos.y >= B.surfaceY) this.state = 'attack';
        break;
      }

      case 'attack': {
        if (this.dormant || distBoatBoss > B.giveUpRadius) {
          this.state = 'descend';
          break;
        }
        // So steuern, dass die Schlundwand aufs Bootszentrum zuwandert –
        // das Maul schiebt sich dabei über das Boot.
        const throat = this.throatPoint(this.throat);
        this.turnTowards(
          Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z),
          dt,
        );
        const dir = this.tmp.copy(boatCenter).sub(throat).setY(0);
        const dist = dir.length();
        if (dist > 0.01) {
          dir.normalize();
          // nur die Anteile in Blickrichtung fahren – der Koloss kann
          // nicht seitwärts gleiten
          const fwd = this.forward(new THREE.Vector3());
          const along = fwd.dot(dir);
          pos.addScaledVector(fwd, Math.max(0, along) * B.chaseSpeed * dt);
        }

        // Verschluckt: Bootszentrum berührt die schwarze Schlundwand
        if (this.throatPoint(this.throat).distanceTo(this.tmp.copy(boatCenter).setY(this.throat.y)) < B.swallowRadius) {
          this.onBoatSwallowed();
          this.setDormant();
        }
        break;
      }

      case 'descend': {
        pos.y = Math.max(B.lurkY, pos.y - B.riseSpeed * dt);
        if (pos.y <= B.lurkY) {
          this.state = this.dormant ? 'lurk' : 'return';
          this.warned = false;
        }
        break;
      }

      case 'return': {
        // langsam zurück zum Nest; dort wieder lauern
        const dNest = Math.hypot(B.nest.x - pos.x, B.nest.z - pos.z);
        if (dNest < 4) {
          this.state = 'lurk';
          break;
        }
        this.turnTowards(Math.atan2(B.nest.x - pos.x, B.nest.z - pos.z), dt);
        const fwd = this.forward(this.tmp);
        pos.addScaledVector(fwd, B.patrolSpeed * dt);
        // taucht ein Boot wieder auf, greift es erneut an
        if (!this.dormant && distBoatNest < B.triggerRadius) this.state = 'rise';
        break;
      }
    }

    this.group.rotation.y = this.heading;
  }
}
