import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Loads the World Labs collider mesh as a wireframe group. It starts hidden;
 * raycasting ignores visibility, so it works either way.
 */
export async function loadCollider(url: string): Promise<THREE.Group> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const material = new THREE.MeshBasicMaterial({
    color: 0x00ff66,
    wireframe: true,
    // Front faces only: a camera inside a pipe or cabinet shell then sees
    // through it instead of pinning to the shell around itself.
    side: THREE.FrontSide,
  });
  gltf.scene.traverse((object) => {
    if (object instanceof THREE.Mesh) object.material = material;
  });
  gltf.scene.visible = false;
  return gltf.scene;
}

const raycaster = new THREE.Raycaster();

/** First point where the ray meets the collider, in world coordinates. */
export function raycastCollider(
  collider: THREE.Object3D,
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): THREE.Vector3 | null {
  raycaster.set(origin, direction);
  return raycaster.intersectObject(collider, true)[0]?.point ?? null;
}

/** Ray through a canvas pixel given in normalised device coordinates. */
export function cameraRay(camera: THREE.Camera, ndcX: number, ndcY: number) {
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  return {
    origin: raycaster.ray.origin.clone(),
    direction: raycaster.ray.direction.clone(),
  };
}

/**
 * Direction of an equirectangular pixel (u, v in 0..1 from the top-left) in
 * the splat's Y-down frame, with the image centre looking down +Z.
 * `yawDegrees` and `mirror` exist to calibrate against a real world.
 */
export function panoDirection(
  u: number,
  v: number,
  yawDegrees = 0,
  mirror = false,
): THREE.Vector3 {
  const longitude =
    (mirror ? 0.5 - u : u - 0.5) * 2 * Math.PI +
    THREE.MathUtils.degToRad(yawDegrees);
  const latitude = (0.5 - v) * Math.PI;
  return new THREE.Vector3(
    Math.cos(latitude) * Math.sin(longitude),
    -Math.sin(latitude),
    Math.cos(latitude) * Math.cos(longitude),
  );
}
