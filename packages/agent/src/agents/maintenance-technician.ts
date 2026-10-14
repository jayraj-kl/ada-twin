import type { RoleDefinition } from "../roles";

export const MAINTENANCE_TECHNICIAN: RoleDefinition<"maintenance"> = {
  title: "Maintenance technician",
  duty: "When more jobs are waiting than crews are free, you decide which station a crew goes to next. A station that is down makes nothing until it is repaired.",
  question: "A maintenance crew is free. Which job does it take?",
  describeOptions: ({ options, snapshot }) =>
    options.map((job) => {
      const station = snapshot.stations.find(({ id }) => id === job.station);
      const waited = Math.round((snapshot.time - job.waitingSince) / 60);
      const task = job.job === "repair" ? "Repair" : "Service";
      return `${task} ${station?.name ?? job.station} (waiting ${waited} min)`;
    }),
};
