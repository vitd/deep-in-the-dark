import * as THREE from 'three';
import { CONFIG } from '../config';
import { loadModel } from '../rendering/Models';

// Ein Standbild der Sunkey-Figur als PNG (Daten-URL) mit durchsichtigem
// Hintergrund – für die wandernden Sunkeys auf dem „WHY?“-Bildschirm.
// Wird einmal aus dem Modell gerendert und dann wiederverwendet.

let bild: Promise<string> | null = null;

export function sunkeyBild(): Promise<string> {
  bild ??= erzeugen();
  return bild;
}

async function erzeugen(): Promise<string> {
  const { template } = await loadModel('sunkey.glb', CONFIG.sunkey.size);
  const figur = template.clone(true);
  // reine Texturfarben, unabhängig von Licht und Nebel
  figur.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const alt = mesh.material as THREE.MeshStandardMaterial;
    mesh.material = new THREE.MeshBasicMaterial({
      map: alt.map ?? null,
      color: alt.map ? 0xffffff : alt.color,
      transparent: true,
      alphaTest: 0.05,
      fog: false,
    });
  });
  const box = new THREE.Box3().setFromObject(figur);
  const groesse = box.getSize(new THREE.Vector3());
  const mitte = box.getCenter(new THREE.Vector3());
  const breite = 96;
  const hoehe = Math.round(breite * (groesse.y / Math.max(groesse.x, 0.001)));

  const canvas = document.createElement('canvas');
  canvas.width = breite;
  canvas.height = hoehe;
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.add(figur);
  const cam = new THREE.OrthographicCamera(
    mitte.x - groesse.x / 2, mitte.x + groesse.x / 2,
    mitte.y + groesse.y / 2, mitte.y - groesse.y / 2,
    0.01, 100,
  );
  cam.position.set(mitte.x, mitte.y, mitte.z + 10);
  cam.lookAt(mitte);
  renderer.render(scene, cam);
  const url = canvas.toDataURL('image/png');
  renderer.dispose();
  renderer.forceContextLoss();
  return url;
}
