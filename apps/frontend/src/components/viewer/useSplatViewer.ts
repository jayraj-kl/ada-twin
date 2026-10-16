import type { Viewer } from "@mkkellogg/gaussian-splats-3d";
import { type RefObject, useEffect, useRef, useState } from "react";
import type { Scene } from "three";

/**
 * Mounts a Gaussian splat viewer into `containerRef` and renders `scene`
 * (ordinary three.js objects) together with the splat.
 */
export function useSplatViewer(
  containerRef: RefObject<HTMLDivElement | null>,
  splatUrl: string,
  scene: Scene,
) {
  const viewerRef = useRef<Viewer | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // The library appends its own canvas; a private mount keeps a re-run of
    // this effect from fighting React over the container's children.
    const mount = document.createElement("div");
    mount.style.position = "absolute";
    mount.style.inset = "0";
    container.prepend(mount);

    let cancelled = false;
    let viewer: Viewer | null = null;
    setStatus("loading");

    (async () => {
      const { Viewer, SceneFormat } =
        await import("@mkkellogg/gaussian-splats-3d");
      if (cancelled) return;

      viewer = new Viewer({
        rootElement: mount,
        threeScene: scene,
        // World Labs splats are Y-down (OpenCV); everything stays in that frame.
        cameraUp: [0, -1, 0],
        initialCameraPosition: [0, 0, 0.01],
        initialCameraLookAt: [0, 0, 1],
        // Shared memory would need cross-origin isolation headers.
        sharedMemoryForWorkers: false,
        // The rail camera owns the view; no orbiting, panning or zooming.
        useBuiltInControls: false,
        gpuAcceleratedSort: false,
      });
      await viewer.addSplatScene(splatUrl, {
        format: SceneFormat.Spz,
        showLoadingUI: false,
      });
      if (cancelled) return;

      viewer.start();
      viewerRef.current = viewer;
      setStatus("ready");
    })().catch((cause: unknown) => {
      if (cancelled) return;
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus("error");
    });

    return () => {
      cancelled = true;
      viewerRef.current = null;
      try {
        viewer?.stop();
        void viewer?.dispose().catch(() => {});
      } catch {
        // Disposal can race the library's own async load.
      }
      mount.remove();
    };
  }, [containerRef, splatUrl, scene]);

  return { viewerRef, status, error };
}
