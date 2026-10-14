import type { RoleDefinition } from "../roles";

export const PRODUCTION_PLANNER: RoleDefinition<"planner"> = {
  title: "Production planner",
  duty: "You set how fast new work is released into the line. Releasing faster raises output only if the line can absorb it; otherwise it just piles up as work in progress.",
  question: "Check-in. Do you change the release rate?",
  describeOptions: ({ options, snapshot }) =>
    options.map((action) => {
      if (action.type !== "set-release") return "Change nothing";
      const source = snapshot.sources.find(({ id }) => id === action.source);
      return `Release ${source?.name ?? action.source} at ${Math.round(action.factor * 100)}% of the nominal rate`;
    }),
};
