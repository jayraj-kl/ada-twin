import type { SimEvent, StationStatus } from "@repo/sim";
import type { Flyer } from "@/components/viewer/FlyerOverlay";
import { type AgentSpec, type Point, ROLE_INFO } from "@/twin/project";

// The world is Y-down, so flying above a pin means a smaller Y.
const FLY_HEIGHT = 0.45;
const CIRCLE_RADIUS = 0.3;

export const STATUS_WORD: Partial<Record<StationStatus, string>> = {
  blocked: "blocked",
  down: "down",
  repairing: "under repair",
  preventive: "being serviced",
  stopped: "stopped, needs auxiliary",
};

/** The colour class of `ui` for each status. */
export const STATUS_STYLE = {
  idle: "idle",
  running: "running",
  blocked: "blocked",
  down: "down",
  repairing: "down",
  preventive: "blocked",
  stopped: "stopped",
} as const satisfies Record<StationStatus, string>;

export interface Floor {
  statuses: Map<string, StationStatus>;
  /** The node each crew is working on. */
  jobs: string[];
  shipped: number;
  scrapped: number;
  wip: number;
}

/** The state of the floor once every event up to `time` has happened. */
export function floorAt(events: SimEvent[], time: number): Floor {
  const statuses = new Map<string, StationStatus>();
  // Keyed by node and unit: crews can work on two units of one auxiliary.
  const jobs = new Map<string, string>();
  let created = 0;
  let shipped = 0;
  let scrapped = 0;
  for (const event of events) {
    if (event.time > time) break;
    if (event.type === "status") statuses.set(event.node, event.status);
    else if (event.type === "created") created += 1;
    else if (event.type === "completed") shipped += 1;
    else if (event.type === "scrap") scrapped += 1;
    else if (
      event.type === "repair-start" ||
      event.type === "preventive-start"
    ) {
      jobs.set(`${event.node}#${event.unit ?? 0}`, event.node);
    } else if (event.type === "repair-end" || event.type === "preventive-end") {
      jobs.delete(`${event.node}#${event.unit ?? 0}`);
    }
  }
  return {
    statuses,
    jobs: [...jobs.values()],
    shipped,
    scrapped,
    wip: created - shipped - scrapped,
  };
}

export function centroid(pins: Point[]): Point {
  const sum = pins.reduce(
    (total, pin) => [total[0] + pin[0], total[1] + pin[1], total[2] + pin[2]],
    [0, 0, 0],
  );
  return [sum[0]! / pins.length, sum[1]! / pins.length, sum[2]! / pins.length];
}

const above = ([x, y, z]: Point): Point => [x, y - FLY_HEIGHT, z];

/** A small loop over a station, for an agent that is working on it. */
function circle(centre: Point): Point[] {
  return Array.from({ length: 8 }, (_, step): Point => {
    const angle = (step / 8) * Math.PI * 2;
    return [
      centre[0] + Math.cos(angle) * CIRCLE_RADIUS,
      centre[1] - FLY_HEIGHT,
      centre[2] + Math.sin(angle) * CIRCLE_RADIUS,
    ];
  });
}

export interface Stop {
  id: string;
  point: Point;
  auxiliary: boolean;
}

/**
 * A paper plane per agent: technicians circle the station their crew is
 * working on, everyone else walks the line.
 */
export function flyersFor(
  stops: Stop[],
  agents: AgentSpec[],
  jobs: string[],
): Flyer[] {
  if (stops.length === 0) return [];
  // Parts never pass auxiliary machines, so nobody walks the line past them;
  // a technician still flies out to repair one.
  const line = stops.filter(({ auxiliary }) => !auxiliary);
  const rounds = (line.length > 0 ? line : stops).map((stop) =>
    above(stop.point),
  );
  const technicians = agents.filter((agent) => agent.role === "maintenance");
  return agents.map((agent, index) => {
    const colour = ROLE_INFO[agent.role].colour;
    const job =
      agent.role === "maintenance"
        ? stops.find(({ id }) => id === jobs[technicians.indexOf(agent)])
        : undefined;
    if (job) return { id: agent.id, colour, waypoints: circle(job.point) };
    if (rounds.length === 1) {
      const [x, y, z] = rounds[0]!;
      return {
        id: agent.id,
        colour,
        waypoints: circle([x, y + FLY_HEIGHT, z]),
      };
    }
    // Planners walk the line against the flow, and each agent starts at a
    // different station, so the planes spread out.
    const route = agent.role === "planner" ? [...rounds].reverse() : rounds;
    const offset = index % route.length;
    return {
      id: agent.id,
      colour,
      waypoints: [...route.slice(offset), ...route.slice(0, offset)],
    };
  });
}
