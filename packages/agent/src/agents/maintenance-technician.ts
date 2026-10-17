import type { RoleDefinition } from "../roles";

export const MAINTENANCE_TECHNICIAN: RoleDefinition<"maintenance"> = {
  title: "Maintenance technician",
  duty: "When more jobs are waiting than crews are free, you decide which station a crew goes to next. A station that is down makes nothing until it is repaired. Support equipment, such as a control cabinet, makes nothing itself, but everything that needs it stops while it is down.",
  question: "A maintenance crew is free. Which job does it take?",
  describeOptions: ({ options, snapshot }) =>
    options.map((job) => {
      const waited = Math.round((snapshot.time - job.waitingSince) / 60);
      const task = job.job === "repair" ? "Repair" : "Service";
      const support = snapshot.supports?.find(({ id }) => id === job.station);
      if (support) {
        const unit =
          support.units > 1 && job.unit !== undefined
            ? ` unit ${job.unit + 1}`
            : "";
        const needed = support.neededBy.join(", ");
        const effect = !needed
          ? ""
          : job.job === "repair"
            ? `; ${needed} stopped until it is fixed`
            : `; servicing it stops ${needed} meanwhile`;
        return `${task} ${support.name}${unit} (waiting ${waited} min${effect})`;
      }
      const station = snapshot.stations.find(({ id }) => id === job.station);
      const unit =
        station && station.units > 1 && job.unit !== undefined
          ? ` unit ${job.unit + 1}`
          : "";
      return `${task} ${station?.name ?? job.station}${unit} (waiting ${waited} min)`;
    }),
};
