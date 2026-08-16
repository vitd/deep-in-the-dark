import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';
import { BoatFrame } from './BoatFrame';

// Der Boss: ein kolossales Maul-Monster (seamonster-boss.glb – ein
// vorne offener, innen schwarzer Schlund), das sehr weit draußen im
// tiefen Teil des Sees unter Wasser lauert. Kommt das Boot seinem Nest
// zu nahe, eilt es in der Tiefe zu einem Punkt NEBEN dem Schiff
// (emergeDistance), durchbricht dort senkrecht – Maul nach oben – die
// Oberfläche, kippt nach vorn auf den Bauch und nimmt erst dann Kurs
// aufs Boot, um sein Maul darüberzuschieben. Verschluckt ist das Boot
// erst, wenn es die schwarze Schlundwand hinten im Maul berührt –
// solange kann man noch hinausfahren. Die Maulwände sind
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

type BossState = 'lurk' | 'approach' | 'rise' | 'roll' | 'attack' | 'descend' | 'return';

export class BossMonster {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private state: BossState = 'lurk';
  private heading = 0;
  // Körperneigung: 0 = Bauchlage (waagrecht), -PI/2 = senkrecht mit
  // dem Maul nach oben (Auftauch-Durchbruch)
  private pitch = 0;
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
    // erst Gieren (heading), dann Nicken (pitch) im gegierten Rahmen
    this.group.rotation.order = 'YXZ';
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
    if (this.state === 'approach' || this.state === 'rise' || this.state === 'roll' || this.state === 'attack') {
      this.state = 'descend';
    }
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
        if (!this.dormant && distBoatNest < B.triggerRadius) this.state = 'approach';
        break;
      }

      case 'approach': {
        // In der Tiefe (unsichtbar) zum Auftauchpunkt NEBEN dem Schiff
        // eilen – auf der Seite, von der der Boss kommt. Dabei stellt
        // er sich schon senkrecht, Maul nach oben; der Bauch zeigt zum
        // Boot, damit das spätere Abrollen dorthin kippt.
        this.heading = Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z);
        this.pitch = Math.max(-Math.PI / 2, this.pitch - B.rollSpeed * 3 * dt);
        const dx = pos.x - boatCenter.x;
        const dz = pos.z - boatCenter.z;
        const d = Math.hypot(dx, dz);
        // Boss (fast) direkt unterm Boot: feste Ausweichrichtung
        const ex = boatCenter.x + (d > 1 ? dx / d : 1) * B.emergeDistance;
        const ez = boatCenter.z + (d > 1 ? dz / d : 0) * B.emergeDistance;
        const mx = ex - pos.x;
        const mz = ez - pos.z;
        const md = Math.hypot(mx, mz);
        const step = B.approachSpeed * dt;
        if (md > step) {
          pos.x += (mx / md) * step;
          pos.z += (mz / md) * step;
        } else {
          pos.x = ex;
          pos.z = ez;
          if (this.pitch <= -Math.PI / 2 + 1e-3) {
            this.state = 'rise';
            if (!this.warned) {
              this.warned = true;
              this.onSurfaced();
            }
          }
        }
        break;
      }

      case 'rise': {
        // senkrechter Durchbruch neben dem Schiff: das Maul schießt aus
        // dem Wasser, bis die Körpermitte den Scheitel erreicht
        this.turnTowards(Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z), dt);
        pos.y = Math.min(B.breachY, pos.y + B.riseSpeed * dt);
        if (pos.y >= B.breachY) this.state = 'roll';
        break;
      }

      case 'roll': {
        // aus der Senkrechten nach vorn auf den Bauch kippen; die
        // Körpermitte sinkt dabei auf die Angriffs-Wasserlinie. Das Maul
        // klatscht dank emergeDistance VOR dem Boot ins Wasser.
        this.turnTowards(Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z), dt);
        this.pitch = Math.min(0, this.pitch + B.rollSpeed * dt);
        const t = 1 + this.pitch / (Math.PI / 2); // 0 senkrecht .. 1 Bauchlage
        pos.y = B.breachY + (B.surfaceY - B.breachY) * t;
        if (this.pitch >= 0) {
          pos.y = B.surfaceY;
          this.state = 'attack'; // erst jetzt nimmt er Kurs aufs Schiff
        }
        break;
      }

      case 'attack': {
        if (this.dormant || distBoatBoss > B.giveUpRadius) {
          this.state = 'descend';
          break;
        }
        // Ist das Boot bereits im Maul, setzt der Boss zum Zubeißen an:
        // Er dreht nicht mehr (sonst schwenkten die Wände dem fliehenden
        // Boot ewig hinterher) und wird langsamer – die faire Chance,
        // im Kanal zu wenden und durch die Öffnung zu entkommen.
        const rel = this.toFrame(boatCenter);
        const inMouth =
          rel.f > GEO.backF && rel.f < GEO.frontF && Math.abs(rel.l) < GEO.halfWIn;
        if (!inMouth) {
          this.turnTowards(Math.atan2(boatCenter.x - pos.x, boatCenter.z - pos.z), dt);
        }
        // So fahren, dass die Schlundwand aufs Bootszentrum zuwandert –
        // das Maul schiebt sich dabei über das Boot. Der Koloss kann
        // nicht seitwärts gleiten, nur vorwärts.
        if (rel.f > GEO.throatF) {
          const speed = B.chaseSpeed * (inMouth ? B.maulTempoFaktor : 1);
          pos.addScaledVector(this.forward(this.tmp), speed * dt);
        }

        // Verschluckt: Bootszentrum im Kanal und an der Schlundwand
        const hit = this.toFrame(boatCenter);
        if (
          Math.abs(hit.l) < GEO.halfWIn &&
          hit.f > GEO.backF &&
          hit.f < GEO.throatF + B.schlundMarge
        ) {
          this.onBoatSwallowed();
          this.setDormant();
        }
        break;
      }

      case 'descend': {
        // dabei zurück in die Bauchlage (falls mitten im Auftauchen
        // abgebrochen wurde, z. B. weil das Schiff gesunken ist)
        this.pitch = Math.min(0, this.pitch + B.rollSpeed * 2 * dt);
        pos.y = Math.max(B.lurkY, pos.y - B.riseSpeed * dt);
        if (pos.y <= B.lurkY && this.pitch >= 0) {
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
        if (!this.dormant && distBoatNest < B.triggerRadius) this.state = 'approach';
        break;
      }
    }

    this.group.rotation.y = this.heading;
    this.group.rotation.x = this.pitch;
  }

  // ---- Undurchdringliche Maulwände ----
  // Das Boot wird als drei Kreise entlang seiner Längsachse geprüft
  // (Bug, Mitte, Heck). Punkte, die in den Boss-Körper eindringen,
  // werden über die kürzeste erlaubte Richtung herausgedrückt: aus der
  // Wandaußenseite nach außen, aus der Wandinnenseite zurück in den
  // Maulkanal – niemals quer durch eine Wand hindurch. Gibt true
  // zurück, wenn das Boot verschoben wurde.
  resolveBoatCollision(frame: BoatFrame): boolean {
    // Während des senkrechten Auftauchens/Abrollens gilt die waagrechte
    // Maulgeometrie nicht – das Monster ist dann ohnehin mindestens
    // emergeDistance - frontF vom Boot entfernt
    if (this.pitch < -0.001) return false;
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
          // an bzw. hinter der Schlundwand: NICHT blocken – sonst hält
          // die Kollision das Bootszentrum dauerhaft außerhalb der
          // Verschluck-Zone und niemand wird je verschluckt. Die
          // Schlundwand ist der Trigger, keine Mauer.
          continue;
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
