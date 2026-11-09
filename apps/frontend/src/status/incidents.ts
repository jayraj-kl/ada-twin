import { COMPONENTS, type ComponentId, type History } from "./history";

export interface IncidentUpdate {
  at: string;
  label: "Investigating" | "Identified" | "Monitoring" | "Resolved";
  text: string;
}

export interface Incident {
  id: string;
  title: string;
  /** Major: the app could not be used. Minor: part of it, or slowly. */
  impact: "major" | "minor";
  components: ComponentId[];
  start: string;
  end: string | null;
  /** Newest first. */
  updates: IncidentUpdate[];
}

/**
 * Incidents written up by hand, newest first. The checker finds outages on
 * its own; one written here replaces what it found for the same time.
 */
export const WRITTEN: Incident[] = [
  {
    id: "2026-10-25-api",
    title: "API unavailable",
    impact: "major",
    components: ["api"],
    // The first failed request; the last one that succeeded before it was
    // on Oct 24 at 13:20 UTC.
    start: "2026-10-25T19:06:10Z",
    end: "2026-10-26T07:49:07Z",
    updates: [
      {
        at: "2026-10-26T07:49:07Z",
        label: "Resolved",
        text: "The API is answering again, and every request since has succeeded. Nothing saved was lost: the database and stored files were not affected.",
      },
      {
        at: "2026-10-26T07:22:04Z",
        label: "Monitoring",
        text: "Billing on our cloud account is active again. The API's hosting is coming back up, and requests may fail for a few more minutes.",
      },
      {
        at: "2026-10-25T19:17:50Z",
        label: "Identified",
        text: "The API is down because billing on our cloud account was suspended. The website still loads, but anything that needs the API fails: opening projects, building twins and running shifts.",
      },
    ],
  },
];

const overlaps = (a: Incident, component: ComponentId, start: string, end: string | null) => {
  const now = new Date().toISOString();
  return (
    a.components.includes(component) &&
    a.start <= (end ?? now) &&
    start <= (a.end ?? now)
  );
};

/** The written incidents and the ones the checker found, newest first. */
export function allIncidents(history: History | null | undefined): Incident[] {
  const found: Incident[] = (history?.incidents ?? [])
    .filter(({ component, start, end }) => !WRITTEN.some((written) => overlaps(written, component, start, end)))
    .map(({ component, start, end }) => {
      const name = COMPONENTS.find((c) => c.id === component)?.name ?? component;
      const updates: IncidentUpdate[] = [
        {
          at: start,
          label: "Investigating",
          text: `The scheduled check found the ${name.toLowerCase()} not answering.`,
        },
      ];
      if (end) {
        updates.unshift({ at: end, label: "Resolved", text: `The ${name.toLowerCase()} is answering again.` });
      }
      return {
        id: `${component}-${start}`,
        title: `${name} unavailable`,
        impact: component === "web" || component === "api" ? "major" : "minor",
        components: [component],
        start,
        end,
        updates,
      };
    });
  return [...WRITTEN, ...found].sort((a, b) => b.start.localeCompare(a.start));
}
