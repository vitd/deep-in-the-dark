import * as THREE from 'three';
import { buildItemObject } from './ItemVisuals';
import type { ItemId } from '../systems/Inventory';

// Rendert die 3D-Modelle der Items einmalig offscreen in kleine
// Thumbnails (Data-URLs) für Inventar, Hotbar und Crafting-Panel.
// Ergebnisse werden pro Item gecacht; schlägt das Rendern fehl
// (kein WebGL, Modell fehlt), liefert itemIconUrl null und die UI
// zeigt den Buchstaben-Platzhalter.

const ICON_SIZE = 96;
const CAMERA_FOV = 30;
// Blickrichtung schräg von vorn-oben, wie bei Item-Vorschauen üblich
const CAMERA_DIR = new THREE.Vector3(0.9, 0.7, 1.6).normalize();

let renderer: THREE.WebGLRenderer | null = null;
const cache = new Map<ItemId, Promise<string | null>>();

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(ICON_SIZE, ICON_SIZE);
    renderer.setClearColor(0x000000, 0);
  }
  return renderer;
}

async function renderIcon(id: ItemId): Promise<string> {
  const obj = await buildItemObject(id, 1);

  // Objekt zentrieren und auf Einheitsgröße normalisieren
  const holder = new THREE.Group();
  holder.add(obj);
  const box = new THREE.Box3().setFromObject(obj);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  obj.position.sub(center);
  const scale = 1 / Math.max(size.x, size.y, size.z, 0.0001);
  holder.scale.setScalar(scale);
  holder.rotation.y = -Math.PI / 7;

  const scene = new THREE.Scene();
  scene.add(holder);
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.8);
  key.position.set(1.5, 2.5, 2);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x88aacc, 0.6);
  fill.position.set(-2, 0.5, -1.5);
  scene.add(fill);

  // Kamera-Abstand aus der Bounding-Sphere, damit jedes Item das
  // Icon möglichst gut ausfüllt
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius * scale, 0.0001);
  const dist = (radius / Math.sin(THREE.MathUtils.degToRad(CAMERA_FOV / 2))) * 1.05;
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.01, 20);
  camera.position.copy(CAMERA_DIR).multiplyScalar(dist);
  camera.lookAt(0, 0, 0);

  const r = getRenderer();
  r.render(scene, camera);
  return r.domElement.toDataURL();
}

export function itemIconUrl(id: ItemId): Promise<string | null> {
  let promise = cache.get(id);
  if (!promise) {
    promise = renderIcon(id).catch(() => null);
    cache.set(id, promise);
  }
  return promise;
}
