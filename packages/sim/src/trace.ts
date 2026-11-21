/** A number the writer was given, as it was shown to them. */
export interface NumberSource {
  /** Where it came from, for the reader: "Before the changes: 312/shift". */
  label: string;
  value: number;
  /** Decimals it was shown with. */
  decimals: number;
  /** A percentage, which only matches a number written with %. */
  percent?: boolean;
}

/** A run of the text: plain, or one number with what it was traced to. */
export type TracedPiece =
  | { text: string; number?: false }
  /** `source` is null when nothing given matches it. */
  | { text: string; number: true; source: string | null };

interface Written {
  value: number;
  /** One step of the last digit written, in the number's own scale. */
  step: number;
  percent: boolean;
}

const SCALE: Record<string, number> = { k: 1e3, K: 1e3, M: 1e6, B: 1e9 };

// A number on its own, not part of a word or id ("M2", "press_2"): an
// optional sign, digits with optional thousands commas and decimals, then an
// optional K/M/B scale or a percent sign.
const NUMBER =
  /(?<![\w.])([+\-−]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:([kKMB])(?![a-zA-Z])|(\s?%|\s?percent\b))?/g;

function read(match: RegExpExecArray): Written {
  const [, , whole, fraction = "", scale, percent] = match;
  const by = scale ? SCALE[scale]! : 1;
  return {
    value: Number(`${whole!.replaceAll(",", "")}.${fraction || 0}`) * by,
    step: 10 ** -fraction.length * by,
    percent: Boolean(percent),
  };
}

const round = (value: number, step: number) => Math.round(value / step) * step;

/**
 * True when `written` is `source` as shown, rounded to the digits written,
 * give or take one in the last of them. The sign is not compared: "loses 12"
 * is how a −12 reads.
 */
function matches(written: Written, source: NumberSource) {
  if (written.percent !== Boolean(source.percent)) return false;
  const shown = round(Math.abs(source.value), 10 ** -source.decimals);
  return (
    Math.abs(round(shown, written.step) - written.value) <=
    written.step * (1 + 1e-9)
  );
}

/** The numbers in a text the writer was given, each matching only itself. */
export function givenNumbers(label: string, text: string): NumberSource[] {
  return [...text.matchAll(NUMBER)].map((match) => {
    const { value, step, percent } = read(match);
    const decimals = Math.max(0, Math.round(-Math.log10(step)));
    return { label, value, decimals, percent };
  });
}

/**
 * Splits `text` into plain runs and the numbers written in it as digits,
 * each traced to the first of `sources` it matches. Order `sources` with the
 * likeliest first, since that one names it.
 */
export function traceNumbers(
  text: string,
  sources: NumberSource[],
): TracedPiece[] {
  const pieces: TracedPiece[] = [];
  let at = 0;
  for (const match of text.matchAll(NUMBER)) {
    if (match.index > at) pieces.push({ text: text.slice(at, match.index) });
    const written = read(match);
    const source = sources.find((candidate) => matches(written, candidate));
    pieces.push({
      text: match[0].trimEnd(),
      number: true,
      source: source?.label ?? null,
    });
    at = match.index + match[0].trimEnd().length;
  }
  if (at < text.length) pieces.push({ text: text.slice(at) });
  return pieces;
}
