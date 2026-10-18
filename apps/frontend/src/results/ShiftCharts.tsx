import type { StationStatus } from "@repo/sim";
import { usePlantUnit } from "@/scenario/plant";
import { ChartLineIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { type DecisionRecord, ROLE_INFO, clock } from "@/twin/project";
import {
  type Series,
  type Timeline,
  highest,
  stepPath,
  valueAt,
} from "./timeline";

// The charts sit on the dark glass over the world in both themes, so their
// colours are the dark theme's.
const SHIPPED = "var(--primary)";
const WIP = "#ffd23f";
const STATUS_FILL: Record<StationStatus, string> = {
  idle: "rgb(255 255 255 / 0.12)",
  running: "#5cbf85",
  blocked: "#e0b04d",
  preventive: "#b98a35",
  down: "#e37373",
  repairing: "#c55a5a",
  stopped: "#8a4a4a",
};
const STATUS_LABEL: Record<StationStatus, string> = {
  idle: "idle",
  running: "working",
  blocked: "blocked",
  preventive: "serviced",
  down: "down",
  repairing: "repair",
  stopped: "stopped",
};
const SHOWN_STATUSES: StationStatus[] = [
  "running",
  "blocked",
  "down",
  "repairing",
  "preventive",
  "stopped",
  "idle",
];
const SHIPPED_HEIGHT = 64;
const WIP_HEIGHT = 36;

/**
 * The shift as charts, up to the moment the floor shows: parts shipped
 * against standard rules and the target pace, parts in progress, and what
 * each station was doing. Agent decisions are ticks under the shipped chart.
 */
export function ShiftCharts({
  timeline,
  standard,
  target,
  horizon,
  now,
  complete,
  decisions,
  stations,
  onSeek,
  open,
  onToggle,
}: {
  timeline: Timeline;
  /** Parts shipped on standard rules, the same day: the dashed line. */
  standard: Series | null;
  target?: number;
  horizon: number;
  now: number;
  /** The whole shift is known, so the scales can fit all of it. */
  complete: boolean;
  decisions: DecisionRecord[];
  stations: { id: string; name: string }[];
  /** Jumps the replay to a moment; absent while the shift is running. */
  onSeek?: (time: number) => void;
  open: boolean;
  onToggle: () => void;
}) {
  const unit = usePlantUnit();
  const shippedNow = valueAt(timeline.shipped, now);
  const standardNow = standard ? valueAt(standard, now) : null;
  const wipNow = valueAt(timeline.wip, now);

  // Scales hold still while the shift plays: they fit what the whole shift
  // will reach, when that is known.
  const shippedTop = Math.max(
    1,
    target ?? 0,
    standard ? highest(standard) : 0,
    complete ? highest(timeline.shipped) : shippedNow * 1.15,
  );
  const wipTop = Math.max(
    4,
    complete ? highest(timeline.wip) : highest(timeline.wip) * 1.2,
  );

  const paths = useMemo(
    () => ({
      shipped: stepPath(timeline.shipped, {
        until: now,
        horizon,
        top: shippedTop,
        height: SHIPPED_HEIGHT,
      }),
      standard: standard
        ? stepPath(standard, {
            until: horizon,
            horizon,
            top: shippedTop,
            height: SHIPPED_HEIGHT,
          })
        : "",
      wip: stepPath(timeline.wip, {
        until: now,
        horizon,
        top: wipTop,
        height: WIP_HEIGHT,
      }),
    }),
    [timeline, standard, now, horizon, shippedTop, wipTop],
  );
  const lanes = stations.filter(({ id }) => timeline.lanes.has(id));
  const at = (time: number) => `${(Math.min(time, horizon) / horizon) * 100}%`;
  const playhead = (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-y-0 w-px bg-white/60"
      style={{ left: at(now) }}
    />
  );

  return (
    <section
      aria-label="The shift so far"
      className="pointer-events-auto w-full rounded-2xl border border-white/15 bg-[#14140f]/85 p-3 text-white backdrop-blur-md"
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold">
        <span className="flex items-center gap-1.5">
          <ChartLineIcon className="size-3.5 text-primary" />
          The shift so far
          <span className="font-mono font-normal text-white/60">
            {clock(now)}
          </span>
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-label={open ? "Hide the charts" : "Show the charts"}
          className="grid size-6 place-items-center rounded-full text-white/70 outline-none hover:text-primary focus-visible:ring-[3px] focus-visible:ring-primary/50"
        >
          {open ? (
            <ChevronDownIcon className="size-4" />
          ) : (
            <ChevronUpIcon className="size-4" />
          )}
        </button>
      </div>

      {open && (
        <div className="mt-2 flex flex-col gap-2.5 max-lg:max-h-[34svh] max-lg:overflow-y-auto max-lg:pr-1">
          {/* Shipped */}
          <div>
            <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[11px] text-white/70">
              <span>
                <Swatch colour={SHIPPED} /> Shipped{" "}
                <strong className="font-mono text-white">{shippedNow}</strong>
              </span>
              {standardNow !== null && (
                <span>
                  <Swatch colour="rgb(255 255 255 / 0.6)" dashed /> Standard
                  rules <span className="font-mono">{standardNow}</span>
                </span>
              )}
              {target !== undefined && (
                <span>
                  <Swatch colour="rgb(255 255 255 / 0.35)" dashed /> Target pace{" "}
                  <span className="font-mono">
                    {Math.round((target * Math.min(now, horizon)) / horizon)}
                  </span>
                </span>
              )}
            </div>
            <div className="relative" style={{ height: SHIPPED_HEIGHT }}>
              <svg
                viewBox={`0 0 1000 ${SHIPPED_HEIGHT}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible"
                role="img"
                aria-label={`${shippedNow} ${unit} shipped by ${clock(now)}`}
              >
                <line
                  x1={0}
                  x2={1000}
                  y1={SHIPPED_HEIGHT}
                  y2={SHIPPED_HEIGHT}
                  stroke="rgb(255 255 255 / 0.15)"
                  vectorEffect="non-scaling-stroke"
                />
                {target !== undefined && (
                  <line
                    x1={0}
                    y1={SHIPPED_HEIGHT}
                    x2={1000}
                    y2={SHIPPED_HEIGHT - (target / shippedTop) * SHIPPED_HEIGHT}
                    stroke="rgb(255 255 255 / 0.35)"
                    strokeDasharray="2 4"
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                {paths.standard && (
                  <path
                    d={paths.standard}
                    fill="none"
                    stroke="rgb(255 255 255 / 0.6)"
                    strokeDasharray="5 4"
                    strokeWidth={1.25}
                    vectorEffect="non-scaling-stroke"
                  />
                )}
                <path
                  d={paths.shipped}
                  fill="none"
                  stroke={SHIPPED}
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {playhead}
            </div>
            {decisions.length > 0 && (
              <div className="relative mt-1 h-3" aria-label="Agent decisions">
                {decisions
                  .filter((record) => record.time <= now)
                  .map((record, index) => {
                    const label = `${clock(record.time)} · ${record.agent.name}: ${record.options[record.choice] ?? "?"}${record.fallback ? " (standard rule)" : ""}`;
                    return (
                      <button
                        key={`${record.time}-${record.agent.id}-${index}`}
                        type="button"
                        title={label}
                        aria-label={label}
                        disabled={!onSeek}
                        onClick={() => onSeek?.(record.time)}
                        className="absolute top-0 h-3 w-1.5 -translate-x-1/2 rounded-sm outline-none hover:scale-y-125 focus-visible:ring-2 focus-visible:ring-primary/60 disabled:cursor-default"
                        style={{
                          left: at(record.time),
                          background: record.fallback
                            ? "rgb(255 255 255 / 0.4)"
                            : ROLE_INFO[record.agent.role].colour,
                        }}
                      />
                    );
                  })}
              </div>
            )}
          </div>

          {/* In progress */}
          <div>
            <div className="mb-1 text-[11px] text-white/70">
              <Swatch colour={WIP} /> In progress{" "}
              <strong className="font-mono text-white">{wipNow}</strong>
            </div>
            <div className="relative" style={{ height: WIP_HEIGHT }}>
              <svg
                viewBox={`0 0 1000 ${WIP_HEIGHT}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full overflow-visible"
                role="img"
                aria-label={`${wipNow} ${unit} in progress at ${clock(now)}`}
              >
                {paths.wip && (
                  <path
                    d={`${paths.wip}V${WIP_HEIGHT}H0Z`}
                    fill={WIP}
                    fillOpacity={0.18}
                    stroke="none"
                  />
                )}
                <path
                  d={paths.wip}
                  fill="none"
                  stroke={WIP}
                  strokeWidth={1.5}
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {playhead}
            </div>
          </div>

          {/* Stations */}
          {lanes.length > 0 && (
            <div>
              <div className="mb-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[11px] text-white/70">
                {SHOWN_STATUSES.map((status) => (
                  <span key={status}>
                    <Swatch colour={STATUS_FILL[status]} square />{" "}
                    {STATUS_LABEL[status]}
                  </span>
                ))}
              </div>
              <ul className="flex max-h-28 list-none flex-col gap-1 overflow-y-auto">
                {lanes.map(({ id, name }) => (
                  <li
                    key={id}
                    className="grid grid-cols-[minmax(0,88px)_minmax(0,1fr)] items-center gap-2"
                  >
                    <span className="truncate text-[11px] text-white/80">
                      {name}
                    </span>
                    <div className="relative h-2.5 overflow-hidden rounded-sm bg-white/5">
                      <svg
                        viewBox="0 0 1000 1"
                        preserveAspectRatio="none"
                        className="absolute inset-0 size-full"
                        aria-hidden
                      >
                        {timeline.lanes
                          .get(id)!
                          .map((span) =>
                            span.from > now ? null : (
                              <rect
                                key={span.from}
                                x={(span.from / horizon) * 1000}
                                width={
                                  ((Math.min(span.to, now, horizon) -
                                    span.from) /
                                    horizon) *
                                  1000
                                }
                                y={0}
                                height={1}
                                fill={STATUS_FILL[span.status]}
                              />
                            ),
                          )}
                      </svg>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex justify-between font-mono text-[10px] text-white/50">
            <span>{clock(0)}</span>
            <span>{clock(horizon / 2)}</span>
            <span>{clock(horizon)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

function Swatch({
  colour,
  dashed,
  square,
}: {
  colour: string;
  dashed?: boolean;
  square?: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block align-middle",
        square ? "size-2 rounded-[2px]" : "h-0 w-3 border-t-2",
        dashed && "border-dashed",
      )}
      style={square ? { background: colour } : { borderColor: colour }}
    />
  );
}
