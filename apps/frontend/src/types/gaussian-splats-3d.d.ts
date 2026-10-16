// The library ships no types; this covers only what the viewer uses.
declare module "@mkkellogg/gaussian-splats-3d" {
  import type {
    PerspectiveCamera,
    Scene,
    Vector3,
    WebGLRenderer,
  } from "three";

  export const SceneFormat: { Ply: number; Splat: number; Spz: number };

  export interface ViewerOptions {
    rootElement?: HTMLElement;
    threeScene?: Scene;
    cameraUp?: [number, number, number];
    initialCameraPosition?: [number, number, number];
    initialCameraLookAt?: [number, number, number];
    gpuAcceleratedSort?: boolean;
    sharedMemoryForWorkers?: boolean;
    useBuiltInControls?: boolean;
    antialiased?: boolean;
  }

  export interface SplatSceneOptions {
    format?: number;
    showLoadingUI?: boolean;
    splatAlphaRemovalThreshold?: number;
  }

  export class Viewer {
    constructor(options?: ViewerOptions);
    camera: PerspectiveCamera;
    renderer: WebGLRenderer;
    addSplatScene(path: string, options?: SplatSceneOptions): Promise<void>;
    start(): void;
    stop(): void;
    dispose(): Promise<void>;
    getSplatMesh(): {
      getSplatCount(): number;
      getSplatCenter(
        index: number,
        out: Vector3,
        applySceneTransform?: boolean,
      ): void;
    };
  }
}
