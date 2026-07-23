import * as THREE from 'three';

// Zentraler Textur-Loader für den Pixel-Look: Nearest-Neighbor-Filterung
// (kein Weichzeichnen), Kachel-Wiederholung. Die Dateien liegen unter
// public/assets/textures/ und werden vom Kunden geliefert.

const loader = new THREE.TextureLoader();

export function pixelTexture(file: string, repeatX = 1, repeatY = 1): THREE.Texture {
  const tex = loader.load(`assets/textures/${file}`);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// Lambert-Material mit Pixel-Textur; Farbtönung über `tint` und
// Aufhellung dunkler Texturen über `brightness` (> 1 hellt auf).
export function texturedMat(
  file: string,
  repeatX = 1,
  repeatY = 1,
  tint = 0xffffff,
  brightness = 1,
): THREE.MeshLambertMaterial {
  const color = new THREE.Color(tint).multiplyScalar(brightness);
  return new THREE.MeshLambertMaterial({
    map: pixelTexture(file, repeatX, repeatY),
    color,
  });
}
