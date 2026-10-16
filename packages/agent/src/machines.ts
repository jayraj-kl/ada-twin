/** One line of the machine list the user gives at capture. */
export interface Machine {
  id: string;
  /** What the plant calls it, e.g. "Feed pumps". */
  name: string;
  /** Kind of equipment, e.g. "centrifugal pump". */
  type?: string;
  manufacturer?: string;
  model?: string;
  /** Identical machines working side by side; default 1. */
  count?: number;
  notes?: string;
  /**
   * Support equipment, such as a control cabinet: parts never pass through
   * it, but what needs it stops when it fails.
   */
  auxiliary?: boolean;
}

/**
 * True when there is nothing to look a machine up by: no document, and no
 * manufacturer and model. The user is asked for details before research,
 * because a search on the plant's own nickname finds nothing useful.
 */
export function needsInfo(machine: Machine, documentCount: number): boolean {
  return documentCount === 0 && !(machine.manufacturer && machine.model);
}

export function describeMachine(machine: Machine): string {
  return [
    `Name: ${machine.name}`,
    machine.type && `Type: ${machine.type}`,
    machine.manufacturer && `Manufacturer: ${machine.manufacturer}`,
    machine.model && `Model: ${machine.model}`,
    `Count: ${machine.count ?? 1}`,
    machine.auxiliary &&
      "Role: support equipment; parts do not pass through it",
    machine.notes && `Notes: ${machine.notes}`,
  ]
    .filter(Boolean)
    .join("\n");
}
