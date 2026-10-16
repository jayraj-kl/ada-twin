import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import * as THREE from "three";
import { raycastCollider } from "./colliderRaycast";

// The camera never hangs closer to the roof than this share of room height.
const HANG_BELOW_CEILING = 0.12;
// Enough splats to find where the scene is, without walking all of them.
const SAMPLE_COUNT = 40_000;
// Directions tried when looking for the hall's long axis.
const AXIS_PROBES = 36;
// How far below the horizon the camera looks when it starts.
export const RAIL_TILT_DEGREES = 40;
// Splats this close (splat units) to floor height count as floor.
const FLOOR_BAND = 0.15;
// Only floor within this many splat units of the centre line sets its length.
const RAIL_BAND = 1.5;
// The strip spans this middle share of the floor. A generated
// world thins into blur towards its edges; the tails are where that happens.
const RAIL_SPAN = [0.05, 0.95] as const;

/**
 * The patch of ceiling a camera may roam: a strip along the hall, at one
 * fixed height. `start` to `end` is its centre line.
 */
export interface CeilingRail {
  start: THREE.Vector3;
  end: THREE.Vector3;
  /** Where on the centre line (0..1) the world origin is. */
  home: number;
  /** Unit vector across the hall, and how far the strip reaches along it. */
  side: THREE.Vector3;
  sideRange: [number, number];
  floorY: number;
}

/**
 * Lays the strip `height` splat units above the floor (kept under the roof),
 * through the world origin and along the hall's longest clear run, ending
 * where the floor splats thin out so the camera cannot leave the detailed
 * part of the world. Null when the collider has no floor or ceiling at the
 * origin.
 */
export function ceilingRail(
  viewer: Viewer,
  collider: THREE.Object3D,
  height: number,
): CeilingRail | null {
  const origin = new THREE.Vector3();
  // Y points down in the splat's frame, so "up" is -Y.
  const floor = raycastCollider(collider, origin, new THREE.Vector3(0, 1, 0));
  if (!floor) return null;

  // Pipes and beams sit below the roof, so probe a few spots and keep the
  // highest first hit. (The last hit would be the mesh's far outer shell.)
  const up = new THREE.Vector3(0, -1, 0);
  let ceilingY = Infinity;
  for (const x of [-1, 0, 1]) {
    for (const z of [-1, 0, 1]) {
      const hit = raycastCollider(collider, new THREE.Vector3(x, 0, z), up);
      if (hit) ceilingY = Math.min(ceilingY, hit.y);
    }
  }
  if (!Number.isFinite(ceilingY)) return null;

  // The hall runs along the longest clear line through the origin at eye
  // level, where the panorama could see.
  const directions = Array.from({ length: AXIS_PROBES }, (_, index) => {
    const angle = (index / AXIS_PROBES) * Math.PI;
    return new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  });
  const clearRun = (direction: THREE.Vector3) =>
    (raycastCollider(collider, origin, direction)?.length() ?? 0) +
    (raycastCollider(collider, origin, direction.clone().negate())?.length() ??
      0);
  const axis = directions.reduce((best, direction) =>
    clearRun(direction) > clearRun(best) ? direction : best,
  );

  // Forward is the way the hall runs further before something closes it.
  const reach = (direction: THREE.Vector3) =>
    raycastCollider(collider, origin, direction)?.length() ?? 0;
  if (reach(axis.clone().negate()) > reach(axis)) axis.negate();
  const side = new THREE.Vector3(axis.z, 0, -axis.x);

  // Floor splats are the direct evidence of where the world was actually
  // generated, so they set how far the strip reaches.
  const mesh = viewer.getSplatMesh();
  const total = mesh.getSplatCount();
  const stride = Math.max(1, Math.floor(total / SAMPLE_COUNT));
  const center = new THREE.Vector3();
  const floorPoints: { along: number; aside: number }[] = [];
  for (let index = 0; index < total; index += stride) {
    mesh.getSplatCenter(index, center, true);
    if (Math.abs(center.y - floor.y) > FLOOR_BAND) continue;
    floorPoints.push({ along: center.dot(axis), aside: center.dot(side) });
  }
  // The middle share of the values, widened to include the origin, where
  // the panorama was shot.
  const span = (values: number[]): [number, number] => {
    values.sort((a, b) => a - b);
    const at = (share: number) =>
      values[Math.round(share * (values.length - 1))] ?? 0;
    return [Math.min(at(RAIL_SPAN[0]), 0), Math.max(at(RAIL_SPAN[1]), 0)];
  };
  const [behind, ahead] = span(
    floorPoints
      .filter((point) => Math.abs(point.aside) <= RAIL_BAND)
      .map((point) => point.along),
  );
  const sideRange = span(
    floorPoints
      .filter((point) => point.along >= behind && point.along <= ahead)
      .map((point) => point.aside),
  );
  const length = ahead - behind;
  if (length === 0) return null;

  const cameraY = Math.max(
    floor.y - height,
    ceilingY + (floor.y - ceilingY) * HANG_BELOW_CEILING,
  );
  return {
    start: axis.clone().multiplyScalar(behind).setY(cameraY),
    end: axis.clone().multiplyScalar(ahead).setY(cameraY),
    home: -behind / length,
    side,
    sideRange,
    floorY: floor.y,
  };
}
