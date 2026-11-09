import type { ComponentId, History } from "./history";
import type { Incident } from "./incidents";

export const DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;
// Down this long in a day draws the day as an outage rather than a blip.
const OUTAGE_MINUTES = 30;

export type DayState = "up" | "degraded" | "partial" | "outage" | "none";

export interface Day {
  /** UTC date, YYYY-MM-DD. */
  date: string;
  state: DayState;
  downMinutes: number;
  rounds: number;
  /** The share of the day it was up, or null with nothing known. */
  share: number | null;
  /** How much of the day has passed, in ms: today's is partial. */
  span: number;
}

const utcDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** One component's last 90 UTC days, oldest first. */
export function componentDays(
  id: ComponentId,
  history: History | null | undefined,
  incidents: Incident[],
  now = Date.now(),
): Day[] {
  const today = Date.parse(`${utcDate(now)}T00:00:00Z`);
  return Array.from({ length: DAYS }, (_, i) => {
    const dayStart = today - (DAYS - 1 - i) * DAY_MS;
    const dayEnd = Math.min(dayStart + DAY_MS, now);
    const date = utcDate(dayStart);

    let downMs = 0;
    for (const incident of incidents) {
      if (!incident.components.includes(id)) continue;
      const start = Math.max(Date.parse(incident.start), dayStart);
      const end = Math.min(incident.end ? Date.parse(incident.end) : now, dayEnd);
      if (end > start) downMs += end - start;
    }
    const downMinutes = Math.round(downMs / 60_000);

    const counts = history?.days[date]?.[id];
    const rounds = counts ? counts.up + counts.degraded + counts.down : 0;
    const state: DayState =
      downMinutes >= OUTAGE_MINUTES
        ? "outage"
        : downMinutes > 0 || (counts?.down ?? 0) > 0
          ? "partial"
          : (counts?.degraded ?? 0) > 0
            ? "degraded"
            : rounds > 0
              ? "up"
              : "none";
    // The checker's rounds and the incidents can each miss an outage the
    // other saw, so the day counts the lower of the two.
    const fromRounds = counts && rounds > 0 ? (counts.up + counts.degraded) / rounds : null;
    const fromIncidents = downMs > 0 ? 1 - downMs / (dayEnd - dayStart) : null;
    const share =
      fromRounds === null ? fromIncidents : fromIncidents === null ? fromRounds : Math.min(fromRounds, fromIncidents);
    return { date, state, downMinutes, rounds, share, span: dayEnd - dayStart };
  });
}

/**
 * The share of the time it was up, over the days anything is known about,
 * or null for none.
 */
export function uptime(days: Day[]) {
  let up = 0;
  let known = 0;
  for (const day of days) {
    if (day.share === null) continue;
    up += day.share * day.span;
    known += day.span;
  }
  return known === 0 ? null : up / known;
}
