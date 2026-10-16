import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import { type RefObject, useEffect } from "react";
import * as THREE from "three";
import { type CeilingRail, RAIL_TILT_DEGREES } from "./ceilingRail";

// Splat units per second.
const TRAVEL_SPEED = 1.2;
// How many times faster it moves while Shift is held.
const SPRINT = 3;
// Degrees turned per pixel dragged, at the widest zoom.
const LOOK_SPEED = 0.15;
// Degrees below the horizon the camera may look: slightly up to straight down.
const PITCH_RANGE = [-20, 89] as const;
// Vertical field of view in degrees: zoomed right in to fully out.
const FOV_RANGE = [15, 70] as const;
const FOV_PER_WHEEL_NOTCH = 4;

/**
 * Hangs the camera from a strip of ceiling. Dragging the mouse looks around,
 * W / S and the up / down arrows move it forward and back in whichever way it
 * is facing (faster with Shift held), and the wheel zooms. It cannot rise,
 * drop or leave the strip.
 */
export function useRailCamera(
  viewerRef: RefObject<Viewer | null>,
  containerRef: RefObject<HTMLDivElement | null>,
  rail: CeilingRail | null,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!rail || !container) return;

    const length = rail.start.distanceTo(rail.end);
    const forward = rail.end.clone().sub(rail.start).normalize();
    // Y points down in the splat's frame.
    const down = new THREE.Vector3(0, 1, 0);
    const heading = new THREE.Vector3();
    const gaze = new THREE.Vector3();
    const target = new THREE.Vector3();
    const held = new Set<string>();
    let travelled = rail.home * length;
    let sideways = 0;
    let yaw = 0;
    let pitch: number = RAIL_TILT_DEGREES;
    let fov: number = FOV_RANGE[1];
    let drag: { x: number; y: number } | null = null;
    let frame = 0;
    let last = performance.now();

    const isTyping = (element: EventTarget | null) =>
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement;
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      if (event.code.startsWith("Arrow")) event.preventDefault();
      held.add(event.code);
    };
    const onKeyUp = (event: KeyboardEvent) => held.delete(event.code);
    const onBlur = () => {
      held.clear();
      drag = null;
    };

    const onPointerDown = (event: PointerEvent) => {
      if (event.button === 0) drag = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag) return;
      // The scene follows the cursor, and turns slower the further it is zoomed.
      const speed = LOOK_SPEED * (fov / FOV_RANGE[1]);
      yaw -= (event.clientX - drag.x) * speed;
      pitch = THREE.MathUtils.clamp(
        pitch - (event.clientY - drag.y) * speed,
        ...PITCH_RANGE,
      );
      drag = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = () => {
      drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      fov = THREE.MathUtils.clamp(
        fov + Math.sign(event.deltaY) * FOV_PER_WHEEL_NOTCH,
        ...FOV_RANGE,
      );
    };

    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      // Capped so a stalled or backgrounded tab does not jump the camera.
      const step = TRAVEL_SPEED * Math.min((now - last) / 1000, 0.1);
      last = now;
      const camera = viewerRef.current?.camera;
      if (!camera) return;

      // Forward is wherever the camera faces, flattened so it stays level.
      heading.copy(forward).applyAxisAngle(down, THREE.MathUtils.degToRad(yaw));
      let move = 0;
      if (held.has("KeyW") || held.has("ArrowUp")) move += step;
      if (held.has("KeyS") || held.has("ArrowDown")) move -= step;
      if (held.has("ShiftLeft") || held.has("ShiftRight")) move *= SPRINT;
      travelled = THREE.MathUtils.clamp(
        travelled + move * heading.dot(forward),
        0,
        length,
      );
      sideways = THREE.MathUtils.clamp(
        sideways + move * heading.dot(rail.side),
        ...rail.sideRange,
      );
      camera.position
        .copy(rail.start)
        .addScaledVector(forward, travelled)
        .addScaledVector(rail.side, sideways);

      const tilt = THREE.MathUtils.degToRad(pitch);
      gaze
        .copy(heading)
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(down, Math.sin(tilt));
      camera.up.set(0, -1, 0);
      camera.lookAt(target.copy(camera.position).add(gaze));

      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    container.addEventListener("pointerdown", onPointerDown);
    container.addEventListener("wheel", onWheel, { passive: false });
    frame = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      container.removeEventListener("pointerdown", onPointerDown);
      container.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(frame);
    };
  }, [viewerRef, containerRef, rail]);
}
