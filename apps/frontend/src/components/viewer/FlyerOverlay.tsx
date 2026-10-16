import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import { type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";

/** A paper plane that flies a loop of waypoints, trailing a dotted line. */
export interface Flyer {
  id: string;
  /** `#rrggbb`. */
  colour: string;
  /** World positions flown in order, forever. One waypoint is a hover. */
  waypoints: [number, number, number][];
}

// World units per second, and how close counts as having reached a waypoint.
const SPEED = 0.55;
const ARRIVE = 0.04;
// About two seconds of flight: the length of the dotted trail.
const TRAIL_SAMPLES = 110;

// A paper plane about half a unit across, nose along +X. The world is Y-down
// (see useSplatViewer), so "up" on the model is -Y.
const PLANE_SCALE = 0.5;
const PLANE_VERTS = (
  [
    [-0.5, 0.054, 0],
    [-0.5, -0.054, 0.018],
    [0.5, -0.054, 0],
    [-0.5, -0.054, 0.288],
    [-0.5, -0.04, 0.036],
    [-0.5, -0.054, -0.018],
    [-0.5, -0.054, -0.288],
    [-0.5, -0.04, -0.036],
  ] as const
).map(
  ([x, y, z]) =>
    new THREE.Vector3(x * PLANE_SCALE, -y * PLANE_SCALE, z * PLANE_SCALE),
);
const PLANE_FACES = [
  { corners: [0, 1, 2], normal: [-0.018, 0.165, -0.986] },
  { corners: [1, 3, 2], normal: [0, 1, 0] },
  { corners: [3, 4, 2], normal: [0.015, -0.998, 0.053] },
  { corners: [5, 0, 2], normal: [-0.018, 0.165, 0.986] },
  { corners: [6, 5, 2], normal: [0, 1, 0] },
  { corners: [2, 7, 6], normal: [0.015, -0.998, -0.053] },
] as const;
// A key light from above and to the side.
const LIGHT = new THREE.Vector3(0.416, -0.832, 0.249);
const NOSE = new THREE.Vector3(1, 0, 0);

interface Screen {
  x: number;
  y: number;
  visible: boolean;
}

interface Flight {
  position: THREE.Vector3;
  heading: THREE.Vector3;
  next: number;
  route: string;
  trail: Screen[];
}

function toScreen(
  point: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number,
): Screen {
  const projected = point.clone().project(camera);
  return {
    x: ((projected.x + 1) / 2) * width,
    y: ((1 - projected.y) / 2) * height,
    visible: projected.z > -1 && projected.z < 1,
  };
}

function drawPlane(
  ctx: CanvasRenderingContext2D,
  flight: Flight,
  colour: string,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const turn = new THREE.Quaternion().setFromUnitVectors(NOSE, flight.heading);
  const corners = PLANE_VERTS.map((vertex) =>
    vertex.clone().applyQuaternion(turn).add(flight.position),
  );
  const screen = corners.map((corner) =>
    toScreen(corner, camera, width, height),
  );
  if (!screen.some(({ visible }) => visible)) return;

  // Painter's algorithm: furthest face first.
  const faces = PLANE_FACES.map((face) => ({
    face,
    depth:
      face.corners.reduce<number>(
        (sum, index) =>
          sum +
          corners[index]!.clone().applyMatrix4(camera.matrixWorldInverse).z,
        0,
      ) / 3,
  })).sort((a, b) => a.depth - b.depth);

  const [red, green, blue] = [1, 3, 5].map((start) =>
    parseInt(colour.slice(start, start + 2), 16),
  );
  ctx.globalAlpha = 0.95;
  for (const { face } of faces) {
    const [a, b, c] = face.corners.map((index) => screen[index]!);
    if (!a!.visible && !b!.visible && !c!.visible) continue;
    const lit =
      Math.max(
        0,
        new THREE.Vector3(...face.normal).applyQuaternion(turn).dot(LIGHT),
      ) *
        0.65 +
      0.35;
    ctx.beginPath();
    ctx.moveTo(a!.x, a!.y);
    ctx.lineTo(b!.x, b!.y);
    ctx.lineTo(c!.x, c!.y);
    ctx.closePath();
    ctx.fillStyle = `rgb(${Math.round(red! * lit)},${Math.round(green! * lit)},${Math.round(blue! * lit)})`;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 0.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawTrail(
  ctx: CanvasRenderingContext2D,
  trail: Screen[],
  colour: string,
) {
  if (trail.length < 2) return;
  ctx.lineCap = "round";
  // A dark underlay keeps the dotted line readable over bright splats.
  for (const pass of [
    { dash: [], width: 4, colour: "#000000", alpha: 0.5 },
    { dash: [2, 6], width: 2, colour, alpha: 0.8 },
  ]) {
    ctx.setLineDash(pass.dash);
    ctx.lineWidth = pass.width;
    ctx.strokeStyle = pass.colour;
    for (let index = 0; index < trail.length - 1; index++) {
      const from = trail[index]!;
      const to = trail[index + 1]!;
      if (!from.visible || !to.visible) continue;
      ctx.globalAlpha = (1 - index / (trail.length - 1)) * pass.alpha;
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;
  ctx.setLineDash([]);
}

/**
 * Draws each flyer over the splat view. Flyers keep their place when their
 * waypoints change, so a new destination is flown to rather than jumped to.
 */
export function FlyerOverlay({
  viewerRef,
  flyers,
  moving,
}: {
  viewerRef: RefObject<Viewer | null>;
  flyers: Flyer[];
  /** False freezes every flyer where it is. */
  moving: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flyersRef = useRef(flyers);
  flyersRef.current = flyers;
  const movingRef = useRef(moving);
  movingRef.current = moving;

  useEffect(() => {
    const flights = new Map<string, Flight>();
    let frame = 0;
    let last = performance.now();

    const update = (now: number) => {
      frame = requestAnimationFrame(update);
      // A long gap means the tab was hidden; do not leap across the floor.
      const elapsed = Math.min(0.1, (now - last) / 1000);
      last = now;
      const canvas = canvasRef.current;
      const camera = viewerRef.current?.camera;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !camera || !ctx) return;

      const { clientWidth: width, clientHeight: height } = canvas;
      const ratio = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);

      for (const id of flights.keys()) {
        if (!flyersRef.current.some((flyer) => flyer.id === id)) {
          flights.delete(id);
        }
      }
      for (const flyer of flyersRef.current) {
        if (flyer.waypoints.length === 0) continue;
        const route = JSON.stringify(flyer.waypoints);
        let flight = flights.get(flyer.id);
        if (!flight) {
          flight = {
            position: new THREE.Vector3(...flyer.waypoints[0]!),
            heading: NOSE.clone(),
            next: 0,
            route,
            trail: [],
          };
          flights.set(flyer.id, flight);
        } else if (flight.route !== route) {
          flight.route = route;
          flight.next = 0;
        }

        if (movingRef.current) {
          const target = new THREE.Vector3(
            ...flyer.waypoints[flight.next % flyer.waypoints.length]!,
          );
          const step = target.clone().sub(flight.position);
          const distance = step.length();
          if (distance <= ARRIVE) {
            flight.next = (flight.next + 1) % flyer.waypoints.length;
          } else {
            const level = step.clone().setY(0);
            if (level.lengthSq() > 1e-6) {
              // Turns towards the target rather than snapping round. A
              // target dead astern blends to nothing, so snap for that one.
              level.normalize();
              const turned = flight.heading.clone().lerp(level, 0.12);
              flight.heading.copy(
                turned.lengthSq() > 1e-6 ? turned.normalize() : level,
              );
            }
            flight.position.add(
              step.multiplyScalar(Math.min(1, (SPEED * elapsed) / distance)),
            );
          }
        }

        const here = toScreen(flight.position, camera, width, height);
        if (here.visible) {
          if (movingRef.current) {
            flight.trail.unshift(here);
            flight.trail.length = Math.min(flight.trail.length, TRAIL_SAMPLES);
          }
          drawTrail(ctx, flight.trail, flyer.colour);
        } else {
          flight.trail.length = 0;
        }
        drawPlane(ctx, flight, flyer.colour, camera, width, height);
      }
    };

    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [viewerRef]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    />
  );
}
