/** The part of the kernel a page calls to mount a figure; figures take the rest. */
type Stop = [number, number] | null;

declare const HL: {
  inject(root: Document): void;
  mk(tag: string, attrs: Record<string, string>, parent: Element): SVGElement;
  /** An unseen pointer that walks the stops until a real one arrives, and resumes after it leaves. */
  tour(stage: HTMLElement, stops: Stop[], onStop?: (i: number) => void): { stop(): void };
  LAP: Stop[];
};

export default HL;
