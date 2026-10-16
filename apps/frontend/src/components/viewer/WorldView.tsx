import {
  type CSSProperties,
  type MouseEvent,
  type RefObject,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { type CeilingRail, ceilingRail } from "./ceilingRail";
import { type Flyer, FlyerOverlay } from "./FlyerOverlay";
import {
  cameraRay,
  loadCollider,
  panoDirection,
  raycastCollider,
} from "./colliderRaycast";
import { type OverlayItem, ProjectionOverlay } from "./ProjectionOverlay";
import { useRailCamera } from "./useRailCamera";
import { useSplatViewer } from "./useSplatViewer";

// A press that moves further than this is a look-around drag, not a click.
const CLICK_SLOP_PX = 4;

export type Point = [number, number, number];

export interface WorldViewHandle {
  /** The 3D point a panorama pixel (shares of the image) looks at, if any. */
  castFromPanorama(u: number, v: number): Point | null;
}

/**
 * A generated world seen from the ceiling camera, with HTML `items` pinned to
 * 3D points. `worldDir` holds world.spz, collider.glb and world.json.
 */
export function WorldView({
  worldDir,
  cameraHeightMetres,
  items,
  flyers,
  flyersMoving = true,
  onPick,
  handle,
  style,
}: {
  worldDir: string;
  cameraHeightMetres: number;
  items: OverlayItem[];
  /** Paper planes flown over the world, e.g. the agents of a run. */
  flyers?: Flyer[];
  /** False freezes the flyers where they are; default true. */
  flyersMoving?: boolean;
  /** Called with the surface point under a click in the view. */
  onPick?: (point: Point) => void;
  handle?: RefObject<WorldViewHandle | null>;
  style?: CSSProperties;
}) {
  const [scene] = useState(() => new THREE.Scene());
  const containerRef = useRef<HTMLDivElement>(null);
  const colliderRef = useRef<THREE.Group | null>(null);
  const pressRef = useRef<{ x: number; y: number } | null>(null);

  const { viewerRef, status, error } = useSplatViewer(
    containerRef,
    `${worldDir}/world.spz`,
    scene,
  );
  const [rail, setRail] = useState<CeilingRail | null>(null);
  useRailCamera(viewerRef, containerRef, rail);
  const [colliderReady, setColliderReady] = useState(false);
  const [metricScale, setMetricScale] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCollider(`${worldDir}/collider.glb`).then((collider) => {
      if (cancelled) return;
      colliderRef.current = collider;
      scene.add(collider);
      setColliderReady(true);
    });
    fetch(`${worldDir}/world.json`)
      .then((response) => response.json())
      .then((world) => {
        if (cancelled) return;
        // 1 means "unknown scale", which still gives a usable camera height.
        setMetricScale(
          world?.assets?.splats?.semantics_metadata?.metric_scale_factor ?? 1,
        );
      })
      .catch(() => setMetricScale(1));
    return () => {
      cancelled = true;
      if (colliderRef.current) scene.remove(colliderRef.current);
      colliderRef.current = null;
      setColliderReady(false);
    };
  }, [scene, worldDir]);

  useEffect(() => {
    const viewer = viewerRef.current;
    const collider = colliderRef.current;
    if (status !== "ready" || !colliderReady || !viewer || !collider) return;
    if (metricScale === null) return;
    setRail(ceilingRail(viewer, collider, cameraHeightMetres / metricScale));
  }, [viewerRef, status, colliderReady, metricScale, cameraHeightMetres]);

  useImperativeHandle(
    handle,
    () => ({
      castFromPanorama(u, v) {
        const collider = colliderRef.current;
        if (!collider) return null;
        // The panorama was shot from the world origin.
        const hit = raycastCollider(
          collider,
          new THREE.Vector3(),
          panoDirection(u, v),
        );
        return hit ? [hit.x, hit.y, hit.z] : null;
      },
    }),
    [],
  );

  function onClick(event: MouseEvent<HTMLDivElement>) {
    const press = pressRef.current;
    const camera = viewerRef.current?.camera;
    const collider = colliderRef.current;
    if (!press || !camera || !collider || !onPick) return;
    const moved = Math.hypot(event.clientX - press.x, event.clientY - press.y);
    if (moved > CLICK_SLOP_PX) return;
    const box = event.currentTarget.getBoundingClientRect();
    const { origin, direction } = cameraRay(
      camera,
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    const hit = raycastCollider(collider, origin, direction);
    if (hit) onPick([hit.x, hit.y, hit.z]);
  }

  const loading = status === "loading" || !colliderReady;
  return (
    <div
      ref={containerRef}
      onPointerDown={(event) => {
        pressRef.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={onClick}
      style={{ position: "relative", background: "black", ...style }}
    >
      {flyers && (
        <FlyerOverlay
          viewerRef={viewerRef}
          flyers={flyers}
          moving={flyersMoving}
        />
      )}
      <ProjectionOverlay viewerRef={viewerRef} items={items} />
      {(loading || error) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "grid",
            placeItems: "center",
            color: "white",
            pointerEvents: "none",
          }}
        >
          {error ? `Could not load the world: ${error}` : "Loading the world…"}
        </div>
      )}
    </div>
  );
}
