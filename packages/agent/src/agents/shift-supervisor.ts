import type { RoleDefinition } from "../roles";

export const SHIFT_SUPERVISOR: RoleDefinition<"supervisor"> = {
  title: "Shift supervisor",
  duty: "At each check-in you decide whether to take a healthy station or piece of support equipment out for preventive servicing. Servicing stops it briefly now, but resets its wear so it is less likely to fail later. Servicing support equipment also stops everything that needs it while the work is done.",
  question: "Check-in. Do you send a station for preventive servicing?",
  describeOptions: ({ options, snapshot }) =>
    options.map((action) => {
      if (action.type !== "preventive") return "Change nothing";
      const support = snapshot.supports?.find(
        ({ id }) => id === action.station,
      );
      if (support) {
        const unit = support.units > 1 ? "one unit of " : "";
        const stops = support.neededBy.length
          ? ` (stops ${support.neededBy.join(", ")} meanwhile)`
          : "";
        return `Take ${unit}${support.name} out for preventive servicing${stops}`;
      }
      const station = snapshot.stations.find(({ id }) => id === action.station);
      return `Take ${station?.name ?? action.station} out for preventive servicing`;
    }),
};
