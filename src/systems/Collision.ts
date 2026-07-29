import * as THREE from 'three';

// Sehr einfache, robuste Kollisionswelt: alle festen Flächen sind
// achsenparallele Boxen (AABB). Der Spieler wird als Box (Kapsel-
// Näherung) achsenweise bewegt und bei Überlappung herausgeschoben.

export interface MoveResult {
  grounded: boolean;
  hitHead: boolean;
}

export class CollisionWorld {
  readonly boxes: THREE.Box3[] = [];

  addBox(box: THREE.Box3): void {
    this.boxes.push(box);
  }

  clear(): void {
    this.boxes.length = 0;
  }

  // Bewegt die Spieler-Fußposition `pos` um `delta` und löst Kollisionen
  // achsenweise auf (move-and-slide).
  move(pos: THREE.Vector3, delta: THREE.Vector3, radius: number, height: number): MoveResult {
    const result: MoveResult = { grounded: false, hitHead: false };

    // X-Achse
    pos.x += delta.x;
    this.resolveAxis(pos, radius, height, 'x', delta.x, result);
    // Z-Achse
    pos.z += delta.z;
    this.resolveAxis(pos, radius, height, 'z', delta.z, result);
    // Y-Achse
    pos.y += delta.y;
    this.resolveAxis(pos, radius, height, 'y', delta.y, result);

    return result;
  }

  private resolveAxis(
    pos: THREE.Vector3,
    radius: number,
    height: number,
    axis: 'x' | 'y' | 'z',
    moved: number,
    result: MoveResult,
  ): void {
    const min = new THREE.Vector3(pos.x - radius, pos.y, pos.z - radius);
    const max = new THREE.Vector3(pos.x + radius, pos.y + height, pos.z + radius);

    for (const b of this.boxes) {
      if (
        min.x >= b.max.x || max.x <= b.min.x ||
        min.y >= b.max.y || max.y <= b.min.y ||
        min.z >= b.max.z || max.z <= b.min.z
      ) {
        continue;
      }

      if (axis === 'x' || axis === 'z') {
        // Flache Stufen (Decksprung, Treppen) automatisch hinaufsteigen,
        // statt an ihnen hängen zu bleiben
        const stepUp = b.max.y - pos.y;
        if (stepUp > 0 && stepUp <= 0.42) {
          pos.y = b.max.y;
          min.set(pos.x - radius, pos.y, pos.z - radius);
          max.set(pos.x + radius, pos.y + height, pos.z + radius);
          continue;
        }
      }
      if (axis === 'x') {
        // Ohne eigene Bewegung (z. B. schleifende Berührung beim
        // Entlanggehen an einer schrägen Wand) über die kleinere
        // Durchdringung hinausschieben – nie durch die Wand hindurch.
        const penNeg = b.min.x - max.x; // Schub in -x
        const penPos = b.max.x - min.x; // Schub in +x
        pos.x += moved > 0 ? penNeg : moved < 0 ? penPos : Math.abs(penNeg) < penPos ? penNeg : penPos;
      } else if (axis === 'z') {
        const penNeg = b.min.z - max.z;
        const penPos = b.max.z - min.z;
        pos.z += moved > 0 ? penNeg : moved < 0 ? penPos : Math.abs(penNeg) < penPos ? penNeg : penPos;
      } else {
        if (moved <= 0) {
          // von oben auf eine Box gefallen
          pos.y = b.max.y;
          result.grounded = true;
        } else {
          // mit dem Kopf angestoßen
          pos.y = b.min.y - height;
          result.hitHead = true;
        }
      }
      // Spieler-Box nach der Korrektur aktualisieren
      min.set(pos.x - radius, pos.y, pos.z - radius);
      max.set(pos.x + radius, pos.y + height, pos.z + radius);
    }
  }
}
