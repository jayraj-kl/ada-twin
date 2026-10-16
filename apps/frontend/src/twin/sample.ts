import { PROCESS_KEY } from "./flow";
import { WORLD_DIR } from "./project";

// The sample plant is the world bundled under WORLD_DIR, a real capture. It
// is only ever opened on request, into a project of its own marked as a
// sample, so it never mixes with the user's own work.
export const SAMPLE = {
  name: "Sample · Boiler room",
  title: "Boiler room",
  credit: "Captured with World Labs Marble",
  pano: `${WORLD_DIR}/pano.png`,
  process:
    "Batches come in at the intake and wait on a staging rack. They go through the feed pumps, queue at the header, and are heated in the boilers. After the boilers they wait in an inspection hold, are checked at the control panel, and leave at dispatch.",
} as const;

export const SAMPLE_SEED = { [PROCESS_KEY]: SAMPLE.process };
