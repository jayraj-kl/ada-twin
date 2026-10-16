// One colour per machine, so its row, its pins and its node in the flow read
// as the same thing. Lime is the app's own signal and blue is kept out of the
// theme, so neither is here.
export const MACHINE_COLORS = [
  "#ff8c42", // orange
  "#ff6fb5", // pink
  "#a98bff", // violet
  "#ffd23f", // yellow
  "#4fd69c", // mint
  "#d4a373", // sand
  "#e05cff", // magenta
  "#9bb53a", // olive
] as const;

/** The first colour no other machine has, or the next in turn once all are taken. */
export function nextColor(used: readonly (string | undefined)[]) {
  return (
    MACHINE_COLORS.find((color) => !used.includes(color)) ??
    MACHINE_COLORS[used.length % MACHINE_COLORS.length]!
  );
}

/** Gives colourless machines, saved before colours existed, one each. */
export function withColors<T extends { color?: string }>(machines: T[]): T[] {
  const used: (string | undefined)[] = machines.map(({ color }) => color);
  return machines.map((machine) => {
    if (machine.color) return machine;
    const color = nextColor(used);
    used.push(color);
    return { ...machine, color };
  });
}
