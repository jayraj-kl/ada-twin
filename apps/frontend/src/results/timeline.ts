import type { SimEvent, StationStatus } from "@repo/sim";

/** A step series: the value from each point's time until the next point. */
export type Series = [time: number, value: number][];

export interface Span {
  from: number;
  /** Infinity while it is still going. */
  to: number;
  status: StationStatus;
}

export interface Timeline {
  /** Parts shipped so far. */
  shipped: Series;
  /** Parts in the plant. */
  wip: Series;
  /** Each station's status over the shift, by node id. */
  lanes: Map<string, Span[]>;
}

/** The shift's events as charts: shipped, in progress, and each station's status. */
export function timelineOf(events: SimEvent[]): Timeline {
  const shipped: Series = [[0, 0]];
  const wip: Series = [[0, 0]];
  const lanes = new Map<string, Span[]>();
  let done = 0;
  let inside = 0;
  for (const event of events) {
    if (event.type === "completed") {
      done += 1;
      inside -= 1;
      shipped.push([event.time, done]);
      wip.push([event.time, inside]);
    } else if (event.type === "created") {
      inside += 1;
      wip.push([event.time, inside]);
    } else if (event.type === "scrap") {
      inside -= 1;
      wip.push([event.time, inside]);
    } else if (event.type === "status") {
      const spans = lanes.get(event.node) ?? [];
      const open = spans.at(-1);
      if (open) open.to = event.time;
      spans.push({ from: event.time, to: Infinity, status: event.status });
      lanes.set(event.node, spans);
    }
  }
  return { shipped, wip, lanes };
}

/** The value of `series` at `time`. */
export function valueAt(series: Series, time: number): number {
  let low = 0;
  let high = series.length - 1;
  while (low < high) {
    const middle = (low + high + 1) >> 1;
    if (series[middle]![0] <= time) low = middle;
    else high = middle - 1;
  }
  return series[low]?.[1] ?? 0;
}

export const highest = (series: Series) =>
  series.reduce((top, [, value]) => Math.max(top, value), 0);

/**
 * An SVG path of `series` up to `until`, as steps, on a 1000 × `height` box
 * whose x runs over the shift. Points closer than a pixel are merged, so a
 * long shift draws as fast as a short one.
 */
export function stepPath(
  series: Series,
  {
    until,
    horizon,
    top,
    height,
  }: { until: number; horizon: number; top: number; height: number },
): string {
  const x = (time: number) => (Math.min(time, horizon) / horizon) * 1000;
  const y = (value: number) => height - (value / (top || 1)) * height;
  const points: [number, number][] = [];
  for (const [time, value] of series) {
    if (time > until) break;
    const px = Math.round(x(time) * 2) / 2;
    // Same pixel: only the newest value shows.
    if (points.at(-1)?.[0] === px) points.at(-1)![1] = value;
    else points.push([px, value]);
  }
  if (points.length === 0) return "";
  const [[firstX, firstValue], ...rest] = points as [
    [number, number],
    ...[number, number][],
  ];
  let path = `M${firstX},${y(firstValue)}`;
  for (const [px, value] of rest) path += `H${px}V${y(value)}`;
  return `${path}H${x(until)}`;
}
