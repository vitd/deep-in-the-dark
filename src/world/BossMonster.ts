import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { BoatFrame } from './BoatFrame';

// Der Boss: ein kolossales Maul-Monster (seamonster-boss.glb – ein
// vorne offener, innen schwarzer Schlund), das sehr weit draußen auf
// dem offenen Meer unter Wasser lauert. Kommt das Boot seinem Nest zu
// nahe, taucht es auf und schiebt sein Maul über das Boot. Verschluckt
// ist das Boot erst, wenn es die schwarze Schlundwand hinten im Maul
// berührt – solange kann man noch hinausfahren. Die Maulwände sind
// undurchdringlich: seitlich hineinfahren geht nicht, das Boot wird
// herausgedrückt (resolveBoatCollision).

const B = CONFIG.seaBoss;

// Maulgeometrie aus dem GLB (Modell 12 Einheiten lang, zentriert):
// Öffnung bei -6, Schlundwand bei -1.48, Körperende bei +1.6, innere
// Kanalbreite/-höhe 3.5, Außenkante 3.66. Nach der 180°-Drehung der
// Vorlage zeigt die Öffnung in +Vorwärtsrichtung; alle Maße skalieren
// mit size/12.
const S = B.size / 12;
const GEO = {
  frontF: 6 * S, // Maulöffnung (vor dem Zentrum)
  throatF: 1.48 * S, // schwarze Schlundwand
  backF: -1.6 * S, // hinteres Körperende
  halfWIn: 1.75 * S, // Kanal-Innenmaß (halbe Breite/Höhe)
  wallMid: 1.79 * S, // Mitte der Wanddicke
  halfWOut: 1.83 * S, // Außenkante
};

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
  private readonly tmp2 = new THREE.Vector3();

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

  private forward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  // Punkt in Boss-Koordinaten: f = Anteil in Maulrichtung, l = seitlich
  private toFrame(p: THREE.Vector3): { f: number; l: number } {
    const dx = p.x - this.group.position.x;
    const dz = p.z - this.group.position.z;
    const sin = Math.sin(this.heading);
    const cos = Math.cos(this.heading);
    return { f: dx * sin + dz * cos, l: dx * cos - dz * sin };
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
        this.turnTowards(Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z), dt);
        // So fahren, dass die Schlundwand aufs Bootszentrum zuwandert –
        // das Maul schiebt sich dabei über das Boot. Der Koloss kann
        // nicht seitwärts gleiten, nur vorwärts.
        const { f } = this.toFrame(boatCenter);
        if (f > GEO.throatF) {
          pos.addScaledVector(this.forward(this.tmp), B.chaseSpeed * dt);
        }

        // Verschluckt: Bootszentrum im Kanal und an der Schlundwand
        const rel = this.toFrame(boatCenter);
        if (
          Math.abs(rel.l) < GEO.halfWIn &&
          rel.f > GEO.backF &&
          rel.f < GEO.throatF + B.schlundMarge
        ) {
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
        pos.addScaledVector(this.forward(this.tmp), B.patrolSpeed * dt);
        // taucht ein Boot wieder auf, greift es erneut an
        if (!this.dormant && distBoatNest < B.triggerRadius) this.state = 'rise';
        break;
      }
    }

    this.group.rotation.y = this.heading;
  }

  // ---- Undurchdringliche Maulwände ----
  // Das Boot wird als drei Kreise entlang seiner Längsachse geprüft
  // (Bug, Mitte, Heck). Punkte, die in den Boss-Körper eindringen,
  // werden über die kürzeste erlaubte Richtung herausgedrückt: aus der
  // Wandaußenseite nach außen, aus der Wandinnenseite zurück in den
  // Maulkanal – niemals quer durch eine Wand hindurch. Gibt true
  // zurück, wenn das Boot verschoben wurde.
  resolveBoatCollision(frame: BoatFrame): boolean {
    // vertikal überhaupt auf Boots-Höhe? (Wasserlinie ~0)
    if (this.group.position.y + GEO.halfWIn < -2 || this.group.position.y - GEO.halfWIn > 4) {
      return false;
    }

    const R = 5; // Prüfkreis-Radius (halbe Bootsbreite + Marge)
    const boatFwdX = -Math.sin(frame.yaw);
    const boatFwdZ = -Math.cos(frame.yaw);
    let moved = false;

    // zwei Iterationen, damit sich die drei Punkte nicht gegenseitig
    // wieder in die Wand schieben
    for (let iter = 0; iter < 2; iter++) {
      for (const along of [-8, 0, 8]) {
        const p = this.tmp2.set(
          frame.center.x + frame.offset.x + boatFwdX * along,
          0,
          frame.center.z + frame.offset.z + boatFwdZ * along,
        );
        const { f, l } = this.toFrame(p);
        const absL = Math.abs(l);

        // außerhalb des Körpers?
        if (f < GEO.backF - R || f > GEO.frontF + R || absL > GEO.halfWOut + R) continue;
        // frei im Maulkanal?
        if (f > GEO.throatF && absL < GEO.halfWIn - R) continue;

        // Push-Kandidaten (Betrag, df, dl) – kleinsten anwenden
        const cands: { d: number; df: number; dl: number }[] = [];
        if (absL >= GEO.wallMid) {
          // in der Außenhälfte einer Seitenwand: seitlich nach außen
          const d = GEO.halfWOut + R - absL;
          cands.push({ d, df: 0, dl: Math.sign(l) * d });
        } else if (f > GEO.throatF) {
          // in der Innenhälfte einer Kanalwand: zurück zur Kanalmitte
          const d = absL - (GEO.halfWIn - R);
          cands.push({ d, df: 0, dl: -Math.sign(l) * d });
        } else {
          // im massiven Körper hinter der Schlundwand: nach vorn in den
          // Kanal (dort übernimmt der Verschluck-Trigger)
          cands.push({ d: GEO.throatF + R - f, df: GEO.throatF + R - f, dl: 0 });
        }
        // immer erlaubt: nach hinten oder vorn ganz hinaus
        cands.push({ d: f - (GEO.backF - R), df: GEO.backF - R - f, dl: 0 });
        cands.push({ d: GEO.frontF + R - f, df: GEO.frontF + R - f, dl: 0 });

        cands.sort((a, b) => a.d - b.d);
        const best = cands[0];
        if (best.d <= 0) continue;

        // (df, dl) aus dem Boss-Rahmen zurück in Weltrichtungen
        const sin = Math.sin(this.heading);
        const cos = Math.cos(this.heading);
        frame.offset.x += best.df * sin + best.dl * cos;
        frame.offset.z += best.df * cos - best.dl * sin;
        moved = true;
      }
    }
    return moved;
  }
}
