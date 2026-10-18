import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import { type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * A marker that walks a loop of waypoints: a ring on the floor, a stem up
 * from it and a badge with a glyph on top, trailing a dotted line.
 */
export interface Flyer {
  id: string;
  /** `#rrggbb`. */
  colour: string;
  /** SVG path data on a 24-unit square, stroked white on the badge. */
  glyph: string;
  /** At work where it stands: the ring turns and pulses instead of pointing. */
  working?: boolean;
  /** Floor positions walked in order, forever. One waypoint is a stand. */
  waypoints: [number, number, number][];
}

// World units per second, and how close counts as having reached a waypoint.
const SPEED = 0.55;
const ARRIVE = 0.04;
// About two seconds of walking: the length of the dotted trail.
const TRAIL_SAMPLES = 110;

// The ring around the foot and the stem up to the badge, in world units. The
// world is Y-down (see useSplatViewer), so up is -Y.
const RING_RADIUS = 0.12;
const RING_SAMPLES = 24;
const STEM = 0.35;
// The badge's diameter in pixels, whatever the distance, so it stays legible.
const BADGE_MIN = 18;
const BADGE_MAX = 34;
const NOSE = new THREE.Vector3(1, 0, 0);
const UP = new THREE.Vector3(0, -1, 0);

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

const glyphs = new Map<string, Path2D>();
function glyphPath(d: string) {
  let path = glyphs.get(d);
  if (!path) {
    path = new Path2D(d);
    glyphs.set(d, path);
  }
  return path;
}

/** The ring on the floor, foreshortened as the camera sees it. */
function drawRing(
  ctx: CanvasRenderingContext2D,
  flight: Flight,
  flyer: Flyer,
  moving: boolean,
  now: number,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const ring = (radius: number) =>
    Array.from({ length: RING_SAMPLES }, (_, step) => {
      const angle = (step / RING_SAMPLES) * Math.PI * 2;
      return toScreen(
        flight.position
          .clone()
          .add(
            new THREE.Vector3(
              Math.cos(angle) * radius,
              0,
              Math.sin(angle) * radius,
            ),
          ),
        camera,
        width,
        height,
      );
    });
  const trace = (points: Screen[]) => {
    ctx.beginPath();
    points.forEach(({ x, y }, index) =>
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y),
    );
    ctx.closePath();
  };
  const points = ring(RING_RADIUS);
  if (!points.every(({ visible }) => visible)) return;

  trace(points);
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = flyer.colour;
  ctx.fill();
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 4;
  ctx.strokeStyle = "#000000";
  ctx.stroke();
  ctx.globalAlpha = 0.95;
  ctx.lineWidth = 2;
  ctx.strokeStyle = flyer.colour;
  if (flyer.working) {
    // A turning dashed ring, and a second one pulsing outwards.
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = moving ? -now / 60 : 0;
    ctx.stroke();
    ctx.setLineDash([]);
    if (moving) {
      const phase = (now / 1400) % 1;
      trace(ring(RING_RADIUS * (1 + phase * 1.2)));
      ctx.globalAlpha = (1 - phase) * 0.8;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  } else {
    ctx.stroke();
    // A chevron on the rim, pointing the way it walks.
    const at = (along: number, across: number) =>
      toScreen(
        flight.position
          .clone()
          .addScaledVector(flight.heading, along)
          .addScaledVector(
            new THREE.Vector3(-flight.heading.z, 0, flight.heading.x),
            across,
          ),
        camera,
        width,
        height,
      );
    const tip = at(RING_RADIUS * 1.6, 0);
    const left = at(RING_RADIUS * 1.05, RING_RADIUS * 0.45);
    const right = at(RING_RADIUS * 1.05, -RING_RADIUS * 0.45);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.lineTo(right.x, right.y);
    ctx.closePath();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = flyer.colour;
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** The stem up from the foot and the badge on top of it. */
function drawBadge(
  ctx: CanvasRenderingContext2D,
  flight: Flight,
  flyer: Flyer,
  moving: boolean,
  camera: THREE.Camera,
  width: number,
  height: number,
) {
  const foot = toScreen(flight.position, camera, width, height);
  const topPoint = flight.position.clone().addScaledVector(UP, STEM);
  const top = toScreen(topPoint, camera, width, height);
  if (!top.visible) return;
  // Sized from how large a tenth of a unit looks there, then clamped.
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const aside = toScreen(
    topPoint.clone().addScaledVector(right, 0.1),
    camera,
    width,
    height,
  );
  const size = Math.min(
    BADGE_MAX,
    Math.max(BADGE_MIN, Math.hypot(aside.x - top.x, aside.y - top.y) * 2.4),
  );
  const radius = size / 2;
  ctx.globalAlpha = moving ? 1 : 0.7;

  if (foot.visible) {
    ctx.lineCap = "round";
    for (const pass of [
      { width: 3, colour: "rgba(0,0,0,0.5)" },
      { width: 1.5, colour: flyer.colour },
    ]) {
      ctx.lineWidth = pass.width;
      ctx.strokeStyle = pass.colour;
      ctx.beginPath();
      ctx.moveTo(foot.x, foot.y);
      ctx.lineTo(top.x, top.y);
      ctx.stroke();
    }
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.55)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 1;
  ctx.beginPath();
  ctx.arc(top.x, top.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = flyer.colour;
  ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  // The glyph fills about 60% of the badge.
  const scale = (size * 0.6) / 24;
  ctx.save();
  ctx.translate(top.x - 12 * scale, top.y - 12 * scale);
  ctx.scale(scale, scale);
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#ffffff";
  ctx.stroke(glyphPath(flyer.glyph));
  ctx.restore();
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
 * waypoints change, so a new destination is walked to rather than jumped to.
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
      const drawn: { flyer: Flyer; flight: Flight; depth: number }[] = [];
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
          if (movingRef.current && !flyer.working) {
            flight.trail.unshift(here);
            flight.trail.length = Math.min(flight.trail.length, TRAIL_SAMPLES);
          } else if (!movingRef.current) {
            flight.trail.length = 0;
          }
        } else {
          flight.trail.length = 0;
        }
        drawn.push({
          flyer,
          flight,
          depth: flight.position
            .clone()
            .applyMatrix4(camera.matrixWorldInverse).z,
        });
      }

      // What lies on the floor first, then the badges, furthest first.
      for (const { flyer, flight } of drawn) {
        drawTrail(ctx, flight.trail, flyer.colour);
        drawRing(
          ctx,
          flight,
          flyer,
          movingRef.current,
          now,
          camera,
          width,
          height,
        );
      }
      drawn.sort((a, b) => a.depth - b.depth);
      for (const { flyer, flight } of drawn) {
        drawBadge(ctx, flight, flyer, movingRef.current, camera, width, height);
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
