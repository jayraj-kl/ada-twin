/** Unit-seconds a station spent in each state over a run. */
export interface StationTimes {
  busyTime: number;
  blockedTime: number;
  downTime: number;
  /** Unit-seconds stopped because support equipment it needs was down. */
  stoppedTime: number;
  /** Unit-seconds stopped by each piece of support equipment it needs. */
  stoppedBy: Record<string, number>;
}

export interface StationKpis {
  /** Share of unit-time spent processing parts. */
  utilisation: number;
  /** Share of unit-time holding a finished part that downstream had no room for. */
  blocked: number;
  /** Share of unit-time failed, under repair or in preventive maintenance. */
  down: number;
  /** Share of unit-time stopped, though itself fine, by support equipment it needs. */
  stopped: number;
  /**
   * Share of unit-time stopped by each support it needs. Two can be down at once,
   * so these can add up to more than `stopped`.
   */
  stoppedBy: Record<string, number>;
  /** Share of unit-time up with nothing to do. */
  idle: number;
}

export interface SupportKpis {
  /** Share of time at least one unit was failed, under repair or serviced. */
  down: number;
}

export interface Kpis {
  horizon: number;
  completed: number;
  scrapped: number;
  throughputPerHour: number;
  /** Time-averaged number of parts in the factory. */
  averageWip: number;
  stations: Record<string, StationKpis>;
  /** Missing from runs made before support equipment existed. */
  supports?: Record<string, SupportKpis>;
  /** The station with the least spare capacity; null with no stations. */
  bottleneck: string | null;
  /**
   * What the maintenance crews worked on, in all and by machine. Missing from
   * runs made before crew work was counted.
   */
  crew?: CrewWork & { byNode: Record<string, CrewWork> };
}

/** Crew work on a machine, or in all, over one run. */
export interface CrewWork {
  /** Crew-hours of repairs and services inside the shift. */
  hours: number;
  /** Repairs after a failure that a crew started. */
  repairs: number;
  /** Preventive services a crew started. */
  services: number;
}

export function computeKpis(run: {
  horizon: number;
  completed: number;
  scrapped: number;
  wipTime: number;
  stations: ({ id: string; units: number } & StationTimes)[];
  supports: { id: string; downTime: number }[];
  crew?: Map<string, CrewWork>;
}): Kpis {
  const stations: Record<string, StationKpis> = {};
  let bottleneck: string | null = null;
  let leastSpare = Infinity;
  for (const station of run.stations) {
    const unitTime = station.units * run.horizon;
    const utilisation = station.busyTime / unitTime;
    const blocked = station.blockedTime / unitTime;
    const down = station.downTime / unitTime;
    const stopped = station.stoppedTime / unitTime;
    const stoppedBy = Object.fromEntries(
      Object.entries(station.stoppedBy).map(([id, time]) => [
        id,
        time / unitTime,
      ]),
    );
    const idle = Math.max(0, 1 - utilisation - blocked - down - stopped);
    stations[station.id] = {
      utilisation,
      blocked,
      down,
      stopped,
      stoppedBy,
      idle,
    };
    // Time blocked is the fault of something downstream, so it counts as spare.
    const spare = idle + blocked;
    if (spare < leastSpare) {
      leastSpare = spare;
      bottleneck = station.id;
    }
  }
  return {
    horizon: run.horizon,
    completed: run.completed,
    scrapped: run.scrapped,
    throughputPerHour: (run.completed / run.horizon) * 3600,
    averageWip: run.wipTime / run.horizon,
    stations,
    supports: Object.fromEntries(
      run.supports.map(({ id, downTime }) => [
        id,
        { down: downTime / run.horizon },
      ]),
    ),
    bottleneck,
    ...(run.crew ? { crew: totalCrew(Object.fromEntries(run.crew)) } : {}),
  };
}

/** Crew work by machine, with its total. */
export function totalCrew(
  byNode: Record<string, CrewWork>,
): CrewWork & { byNode: Record<string, CrewWork> } {
  const all = Object.values(byNode);
  const sum = (pick: (work: CrewWork) => number) =>
    all.reduce((total, work) => total + pick(work), 0);
  return {
    hours: sum(({ hours }) => hours),
    repairs: sum(({ repairs }) => repairs),
    services: sum(({ services }) => services),
    byNode,
  };
}
