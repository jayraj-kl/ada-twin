import type { SimEvent, StationStatus } from "@repo/sim";
import type { Flyer } from "@/components/viewer/FlyerOverlay";
import {
  type AgentSpec,
  type Point,
  ROLE_INFO,
  type Role,
} from "@/twin/project";

// How far from a station an agent walks round it, or stands to work on it.
const CIRCLE_RADIUS = 0.3;
const STAND_OFF = 0.2;

// Each role's badge glyph: lucide's clipboard-list, wrench and hard-hat
// (ISC licence), with their rects written as paths.
const GLYPHS: Record<Role, string> = {
  planner:
    "M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M12 11h4 M12 16h4 M8 11h.01 M8 16h.01",
  maintenance:
    "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z",
  supervisor:
    "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5 M14 6a6 6 0 0 1 6 6v3 M4 15v-3a6 6 0 0 1 6-6 M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1z",
};

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

/** A small loop round a station, for an agent with only one to walk to. */
function circle(centre: Point): Point[] {
  return Array.from({ length: 8 }, (_, step): Point => {
    const angle = (step / 8) * Math.PI * 2;
    return [
      centre[0] + Math.cos(angle) * CIRCLE_RADIUS,
      centre[1],
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
 * A marker per agent: technicians stand at the station their crew is working
 * on, everyone else walks the line.
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
  const rounds = (line.length > 0 ? line : stops).map(({ point }) => point);
  const technicians = agents.filter((agent) => agent.role === "maintenance");
  return agents.map((agent, index) => {
    const colour = ROLE_INFO[agent.role].colour;
    const glyph = GLYPHS[agent.role];
    const job =
      agent.role === "maintenance"
        ? stops.find(({ id }) => id === jobs[technicians.indexOf(agent)])
        : undefined;
    if (job) {
      // Crews on one station stand round it rather than on top of each other.
      const angle = technicians.indexOf(agent) * 2.4;
      const [x, y, z] = job.point;
      return {
        id: agent.id,
        colour,
        glyph,
        working: true,
        waypoints: [
          [x + Math.cos(angle) * STAND_OFF, y, z + Math.sin(angle) * STAND_OFF],
        ],
      };
    }
    if (rounds.length === 1) {
      return { id: agent.id, colour, glyph, waypoints: circle(rounds[0]!) };
    }
    // Planners walk the line against the flow, and each agent starts at a
    // different station, so they spread out.
    const route = agent.role === "planner" ? [...rounds].reverse() : rounds;
    const offset = index % route.length;
    return {
      id: agent.id,
      colour,
      glyph,
      waypoints: [...route.slice(offset), ...route.slice(0, offset)],
    };
  });
}
