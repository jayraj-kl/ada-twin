import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import { type ReactNode, type RefObject, useEffect, useRef } from "react";
import * as THREE from "three";

export interface OverlayItem {
  id: string;
  position: [number, number, number];
  content: ReactNode;
}

/**
 * HTML labels pinned to world positions: each frame, every item is projected
 * through the viewer's camera and moved to the matching screen pixel.
 */
export function ProjectionOverlay({
  viewerRef,
  items,
}: {
  viewerRef: RefObject<Viewer | null>;
  items: OverlayItem[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const point = new THREE.Vector3();
    let frame = 0;

    const update = () => {
      frame = requestAnimationFrame(update);
      const root = rootRef.current;
      const camera = viewerRef.current?.camera;
      if (!root || !camera) return;

      const { clientWidth, clientHeight } = root;
      itemsRef.current.forEach((item, index) => {
        const element = root.children[index] as HTMLElement | undefined;
        if (!element) return;
        point.set(...item.position).project(camera);
        // Outside -1..1 in z means behind the camera or past the far plane.
        const visible = point.z > -1 && point.z < 1;
        element.style.display = visible ? "block" : "none";
        if (!visible) return;
        const x = ((point.x + 1) / 2) * clientWidth;
        const y = ((1 - point.y) / 2) * clientHeight;
        element.style.transform = `translate(${x}px, ${y}px)`;
      });
    };

    update();
    return () => cancelAnimationFrame(frame);
  }, [viewerRef]);

  return (
    <div
      ref={rootRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
      }}
    >
      {items.map((item) => (
        <div
          key={item.id}
          style={{ position: "absolute", left: 0, top: 0, display: "none" }}
        >
          {item.content}
        </div>
      ))}
    </div>
  );
}
