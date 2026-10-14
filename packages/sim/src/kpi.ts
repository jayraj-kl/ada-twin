/** Unit-seconds a station spent in each state over a run. */
export interface StationTimes {
  busyTime: number;
  blockedTime: number;
  downTime: number;
}

export interface StationKpis {
  /** Share of unit-time spent processing parts. */
  utilisation: number;
  /** Share of unit-time holding a finished part that downstream had no room for. */
  blocked: number;
  /** Share of time failed, under repair or in preventive maintenance. */
  down: number;
  /** Share of unit-time up with nothing to do. */
  idle: number;
}

export interface Kpis {
  horizon: number;
  completed: number;
  scrapped: number;
  throughputPerHour: number;
  /** Time-averaged number of parts in the factory. */
  averageWip: number;
  stations: Record<string, StationKpis>;
  /** The station with the least spare capacity; null with no stations. */
  bottleneck: string | null;
}

export function computeKpis(run: {
  horizon: number;
  completed: number;
  scrapped: number;
  wipTime: number;
  stations: ({ id: string; units: number } & StationTimes)[];
}): Kpis {
  const stations: Record<string, StationKpis> = {};
  let bottleneck: string | null = null;
  let leastSpare = Infinity;
  for (const station of run.stations) {
    const unitTime = station.units * run.horizon;
    const utilisation = station.busyTime / unitTime;
    const blocked = station.blockedTime / unitTime;
    const down = station.downTime / run.horizon;
    const idle = Math.max(0, 1 - utilisation - blocked - down);
    stations[station.id] = { utilisation, blocked, down, idle };
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
    bottleneck,
  };
}
