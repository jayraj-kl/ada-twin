import { withColors } from "./colors";
import { PROCESS_KEY } from "./flow";
import { MACHINES_KEY, type SavedMachine, WORLD_DIR } from "./project";

// The sample plants are real captures bundled under /worlds/<slug>. Each is
// only ever opened on request, into a project of its own marked as a sample,
// so it never mixes with the user's own work. The sample a project shows is
// kept with it under SAMPLE_WORLD_KEY.
export const SAMPLE_WORLD_KEY = "twin-sample-world";

export const SAMPLE_CREDIT = "Captured with World Labs Marble";

/** A machine seen in a sample's panorama; where it stands is left to the AI. */
export interface SampleMachine {
  name: string;
  count: number;
  auxiliary?: boolean;
}

export interface Sample {
  slug: string;
  /** The room, as a label: "Boiler room". */
  title: string;
  /** The project it opens into. */
  name: string;
  /** Holds world.spz, collider.glb, world.json and pano.png. */
  dir: string;
  pano: string;
  process: string;
  /** What it makes, plural, as the scenario and results count it. */
  unit: string;
  machines: readonly SampleMachine[];
}

function sample(
  slug: string,
  title: string,
  process: string,
  unit: string,
  machines: SampleMachine[],
): Sample {
  const dir = `/worlds/${slug}`;
  return {
    slug,
    title,
    name: `Sample · ${title}`,
    dir,
    pano: `${dir}/pano.png`,
    process,
    unit,
    machines,
  };
}

export const SAMPLES: readonly Sample[] = [
  sample(
    "boiler",
    "Boiler room",
    "Batches come in at the intake and wait on a staging rack. They go through the feed pumps, queue at the header, and are heated in the boilers. After the boilers they wait in an inspection hold, are checked at the control panel, and leave at dispatch.",
    "batches",
    [
      { name: "Feed pumps", count: 2 },
      { name: "Boilers", count: 2 },
      { name: "Control panel", count: 1 },
      { name: "Gas valve trains", count: 2, auxiliary: true },
    ],
  ),
  sample(
    "foundry",
    "Foundry",
    "Steel plate and pipe come in by the overhead crane and wait in the stock bay. Pieces are cut at the cutting tables, fitted, and welded in the screened welding bays. Welded parts cool on a rack, are ground and inspected, and leave at dispatch.",
    "parts",
    [
      { name: "Cutting tables", count: 3 },
      { name: "Welding bays", count: 4 },
      { name: "Grinding station", count: 1 },
      { name: "Overhead crane", count: 1, auxiliary: true },
    ],
  ),
  sample(
    "machine-shop",
    "Machine shop",
    "Large castings come in by the overhead crane and wait on the floor. They are machined on the boring and milling machines, then drilled. Parts queue for deburring, are measured at the inspection bench, and leave through the loading door.",
    "castings",
    [
      { name: "Boring mill", count: 1 },
      { name: "Milling machines", count: 2 },
      { name: "Radial drill", count: 1 },
      { name: "Inspection bench", count: 1 },
      { name: "Overhead crane", count: 1, auxiliary: true },
    ],
  ),
  sample(
    "pump-hall",
    "Pump hall",
    "Batches of water come in from the intake well and wait in the suction tank. The main pumps lift them to the header, where a booster pump raises the pressure. They are checked at the control panel and leave through the outlet main.",
    "batches",
    [
      { name: "Main pumps", count: 2 },
      { name: "Booster pump", count: 1 },
      { name: "Control panel", count: 1 },
    ],
  ),
  sample(
    "electrical-lab",
    "Electrical lab",
    "Electric motors come in from stores and wait at intake. They are stripped and rewound at the workbenches, then run up on the test stands with the motor-generator sets. Motors that pass are checked at the instrument panel and leave at dispatch.",
    "motors",
    [
      { name: "Rewinding workbenches", count: 6 },
      { name: "Motor test stands", count: 4 },
      { name: "Instrument panel", count: 1 },
    ],
  ),
];

// Sample projects opened before there were several samples show the first
// bundled boiler room, which stays the demo world.
const LEGACY: Sample = {
  ...SAMPLES[0]!,
  dir: WORLD_DIR,
  pano: `${WORLD_DIR}/pano.png`,
};

/** The sample a project was opened from, by its stored slug. */
export function sampleOf(slug: unknown): Sample {
  return SAMPLES.find((one) => one.slug === slug) ?? LEGACY;
}

/** A sample's machine list as the twin step keeps it, with no pins yet. */
export function sampleMachines(one: Sample): SavedMachine[] {
  return withColors<SavedMachine>(
    one.machines.map(({ name, count, auxiliary }, index) => ({
      id: `${one.slug}-${index + 1}`,
      name,
      count,
      ...(auxiliary ? { auxiliary } : {}),
    })),
  );
}

/** What a new sample project starts with. */
export const sampleSeed = (one: Sample) => ({
  [PROCESS_KEY]: one.process,
  [MACHINES_KEY]: sampleMachines(one),
});
