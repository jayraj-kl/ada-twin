import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import type { ModelFile } from "./model";

/**
 * An ordinary perspective photo cut out of a 360° panorama. Angles are in
 * degrees: `yaw` turns right from the panorama's centre, `pitch` tilts up.
 */
export interface PanoramaView {
  file: ModelFile;
  yaw: number;
  pitch: number;
  /** Horizontal and vertical field of view; the views are square. */
  fov: number;
}

export interface ViewLayout {
  /** How many views go round the horizon, evenly spaced. */
  count: number;
  pitch: number;
  fov: number;
  size: number;
}

// Eight 90° views overlap by half, so every machine is whole in at least one.
// They tilt down a little because the camera hangs above the machines.
export const DEFAULT_LAYOUT: ViewLayout = {
  count: 8,
  pitch: -15,
  fov: 90,
  size: 1024,
};

type Direction = [number, number, number];

const radians = (degrees: number) => (degrees * Math.PI) / 180;

/**
 * The direction through a point of a view, given as shares of its width and
 * height from the top-left. Y is up and the panorama's centre looks down +Z.
 */
export function viewDirection(
  view: Pick<PanoramaView, "yaw" | "pitch" | "fov">,
  x: number,
  y: number,
): Direction {
  const { forward, right, up, half } = basis(view);
  const across = (2 * x - 1) * half;
  const down = (1 - 2 * y) * half;
  const direction: Direction = [0, 1, 2].map(
    (axis) => forward[axis]! + across * right[axis]! + down * up[axis]!,
  ) as Direction;
  const length = Math.sqrt(
    direction[0] ** 2 + direction[1] ** 2 + direction[2] ** 2,
  );
  return direction.map((value) => value / length) as Direction;
}

/** The axes a view looks along, and the half-width of its image plane. */
function basis(view: Pick<PanoramaView, "yaw" | "pitch" | "fov">) {
  const yaw = radians(view.yaw);
  const pitch = radians(view.pitch);
  const [sinYaw, cosYaw] = [Math.sin(yaw), Math.cos(yaw)];
  const [sinPitch, cosPitch] = [Math.sin(pitch), Math.cos(pitch)];
  return {
    forward: [cosPitch * sinYaw, sinPitch, cosPitch * cosYaw] as Direction,
    right: [cosYaw, 0, -sinYaw] as Direction,
    up: [-sinPitch * sinYaw, cosPitch, -sinPitch * cosYaw] as Direction,
    half: Math.tan(radians(view.fov) / 2),
  };
}

/** Where a direction lands in the panorama, as shares from the top-left. */
export function panoramaPoint([x, y, z]: Direction): [number, number] {
  const longitude = Math.atan2(x, z);
  const latitude = Math.atan2(y, Math.sqrt(x * x + z * z));
  return [0.5 + longitude / (2 * Math.PI), 0.5 - latitude / Math.PI];
}

/** The angle between two unit directions, in degrees. */
export function angleBetween(a: Direction, b: Direction): number {
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return (Math.acos(Math.min(1, Math.max(-1, dot))) * 180) / Math.PI;
}

interface Pixels {
  width: number;
  height: number;
  /** RGBA, row by row from the top-left. */
  data: Uint8Array;
}

function decode(bytes: Uint8Array): Pixels | null {
  const buffer = Buffer.from(bytes);
  // Sniffed from the bytes: a server's content type is not always right.
  if (buffer.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return PNG.sync.read(buffer);
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return jpeg.decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      maxMemoryUsageInMB: 1024,
    });
  }
  return null;
}

/** Bilinear sample at a panorama point; the left and right edges meet. */
function sample(
  source: Pixels,
  u: number,
  v: number,
  out: Uint8Array,
  at: number,
) {
  const x = u * source.width - 0.5;
  const y = Math.min(Math.max(v * source.height - 0.5, 0), source.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const { width, data } = source;
  const left = ((x0 % width) + width) % width;
  const right = (left + 1) % width;
  const above = y0 * width;
  const below = Math.min(y0 + 1, source.height - 1) * width;
  const a = (above + left) * 4;
  const b = (above + right) * 4;
  const c = (below + left) * 4;
  const d = (below + right) * 4;
  for (let channel = 0; channel < 3; channel++) {
    const top = data[a + channel]! * (1 - fx) + data[b + channel]! * fx;
    const bottom = data[c + channel]! * (1 - fx) + data[d + channel]! * fx;
    out[at + channel] = top * (1 - fy) + bottom * fy;
  }
  out[at + 3] = 255;
}

/**
 * Cuts a panorama into perspective views a model can read without the
 * equirectangular distortion. Answers null for an image it cannot decode
 * (anything but PNG or JPEG), so the caller can fall back to the whole image.
 */
export function splitPanorama(
  panorama: ModelFile,
  layout: ViewLayout = DEFAULT_LAYOUT,
): PanoramaView[] | null {
  const source = decode(panorama.bytes);
  if (!source) return null;
  const { size, pitch, fov } = layout;

  return Array.from({ length: layout.count }, (_, index) => {
    const yaw = (360 / layout.count) * index;
    const { forward, right, up, half } = basis({ yaw, pitch, fov });
    const data = new Uint8Array(size * size * 4);
    // viewDirection and panoramaPoint, unrolled: this runs once per pixel.
    for (let row = 0; row < size; row++) {
      const down = (1 - (2 * (row + 0.5)) / size) * half;
      for (let column = 0; column < size; column++) {
        const across = ((2 * (column + 0.5)) / size - 1) * half;
        const x = forward[0] + across * right[0] + down * up[0];
        const y = forward[1] + down * up[1];
        const z = forward[2] + across * right[2] + down * up[2];
        const u = 0.5 + Math.atan2(x, z) / (2 * Math.PI);
        const v = 0.5 - Math.atan2(y, Math.sqrt(x * x + z * z)) / Math.PI;
        sample(source, u, v, data, (row * size + column) * 4);
      }
    }
    const encoded = jpeg.encode({ data, width: size, height: size }, 85);
    return {
      file: { bytes: new Uint8Array(encoded.data), mimeType: "image/jpeg" },
      yaw,
      pitch,
      fov,
    };
  });
}
