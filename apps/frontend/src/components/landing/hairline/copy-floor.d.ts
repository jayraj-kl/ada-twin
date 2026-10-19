type Read = { textContent: string | null };

export declare const copyFloor: {
  name: string;
  means: string;
  rules: number[];
  /** The stagger in ms, between the unit that sinks and the one that rises, at intensity 0, 0.5 and 1. */
  range: [number, number, number];
  tour: ([number, number] | null)[];
  mount(
    host: { stage: HTMLElement; svg: SVGElement; read: Read },
    value: number,
  ): { set(value: number): void; destroy(): void };
};
