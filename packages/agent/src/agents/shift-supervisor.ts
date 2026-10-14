import type { RoleDefinition } from "../roles";

export const SHIFT_SUPERVISOR: RoleDefinition<"supervisor"> = {
  title: "Shift supervisor",
  duty: "At each check-in you decide whether to take a healthy station out for preventive servicing. Servicing stops it briefly now, but resets its wear so it is less likely to fail later.",
  question: "Check-in. Do you send a station for preventive servicing?",
  describeOptions: ({ options, snapshot }) =>
    options.map((action) => {
      if (action.type !== "preventive") return "Change nothing";
      const station = snapshot.stations.find(({ id }) => id === action.station);
      return `Take ${station?.name ?? action.station} out for preventive servicing`;
    }),
};
