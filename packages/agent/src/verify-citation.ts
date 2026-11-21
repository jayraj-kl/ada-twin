/// <reference path="./pdfjs-worker.d.ts" />
/**
 * Checks that what an agent cites is really in the document it names: the
 * page exists, the quoted passage is on it, and the passage states the value.
 * Plain text matching, no model: the same claim always gets the same verdict.
 */

/** A value an agent attributes to a passage, in the unit it is stored in. */
export interface ClaimedValue {
  value: number;
  /**
   * "s" for durations (the passage may say s, min or h), "share" for 0..1
   * (the passage may say %), anything else (a currency, a count) as written.
   */
  unit: string;
}

export interface CitedClaim {
  document: string;
  page?: number;
  quote: string;
  values: ClaimedValue[];
}

/** One readable document: its text page by page, or null when it has none. */
export interface ReadDocument {
  name: string;
  pages: string[] | null;
}

export type Verdict =
  | { status: "verified"; page: number }
  | { status: "failed"; reason: string }
  | { status: "unverifiable"; reason: string };

// --- reading a PDF ------------------------------------------------------------

let worker: Promise<unknown> | undefined;

/**
 * A PDF's text, one string per page; null when it has no text to read (a
 * scan) or is not a PDF that opens.
 */
export async function pdfPages(bytes: Uint8Array): Promise<string[] | null> {
  // Run pdf.js on this thread: the API is bundled into one file, so a worker
  // script loaded by path would not be there.
  worker ??= import("pdfjs-dist/legacy/build/pdf.worker.mjs").then(
    (module) => ((globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = module),
  );
  await worker;
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    const pdf = await getDocument({
      // pdf.js takes ownership of the buffer it is given.
      data: bytes.slice(),
      isEvalSupported: false,
      useSystemFonts: false,
      verbosity: 0,
    }).promise;
    const pages: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const content = await (await pdf.getPage(number)).getTextContent();
      pages.push(
        content.items
          .map((item) =>
            "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "",
          )
          .join(""),
      );
    }
    await pdf.destroy();
    return pages.some((page) => page.trim()) ? pages : null;
  } catch {
    return null;
  }
}

// --- matching -----------------------------------------------------------------

/**
 * Text as compared: lower case, one kind of dash, and no spaces at all, since
 * a PDF's text runs do not keep the spacing the writer saw.
 */
const squash = (text: string) =>
  text
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, "");

const NUMBER =
  /(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(\s?%)?(?:\s*(?:(?:running|operating|calendar|working)\s+)?(seconds?|secs?|s|minutes?|mins?|min|hours?|hrs?|h)\b)?/gi;
// "5.67 to 7.40 h", "1,166,025–2,076,992 hours": the first takes the unit of the second.
const RANGE_GAP = /^\s*(?:-|–|—|to)\s*$/i;

const SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600 };

interface Written {
  value: number;
  /** Half a step of the last digit written: anything within it rounds to this. */
  half: number;
  percent: boolean;
  /** Seconds per written unit, when a time unit follows. */
  scale?: number;
}

function writtenNumbers(passage: string): Written[] {
  const found = [...passage.matchAll(NUMBER)];
  const numbers = found.map((match): Written => {
    const [, whole, fraction = "", percent, unit] = match;
    const scale = unit
      ? SECONDS[unit.toLowerCase().startsWith("mi") ? "m" : unit[0]!.toLowerCase()]
      : undefined;
    return {
      value: Number(`${whole!.replaceAll(",", "")}.${fraction || 0}`),
      half: 0.5 * 10 ** -fraction.length,
      percent: Boolean(percent),
      scale,
    };
  });
  for (let index = numbers.length - 2; index >= 0; index--) {
    const here = found[index]!;
    const next = found[index + 1]!;
    const gap = passage.slice(here.index + here[0].length, next.index);
    if (numbers[index]!.scale === undefined && RANGE_GAP.test(gap)) {
      numbers[index]!.scale = numbers[index + 1]!.scale;
    }
  }
  return numbers;
}

/** True when `passage` writes `claimed`, allowing for unit and rounding. */
export function statesValue(passage: string, claimed: ClaimedValue): boolean {
  return writtenNumbers(passage).some((written) => {
    const scale =
      claimed.unit === "s"
        ? (written.scale ?? 1)
        : claimed.unit === "share" && written.percent
          ? 0.01
          : 1;
    if (claimed.unit === "s" && written.percent) return false;
    const target = written.value * scale;
    return (
      Math.abs(claimed.value - target) <=
      written.half * scale + 1e-9 * Math.max(1, Math.abs(target))
    );
  });
}

/** Whether `claim` holds against the documents it may cite. */
export function verifyClaim(
  documents: ReadDocument[],
  claim: CitedClaim,
): Verdict {
  const document = documents.find(({ name }) => name === claim.document);
  if (!document) {
    return {
      status: "failed",
      reason: `"${claim.document}" is not one of this machine's documents`,
    };
  }
  if (!document.pages) {
    return {
      status: "unverifiable",
      reason: `"${claim.document}" has no text to check against`,
    };
  }
  const quote = squash(claim.quote);
  if (quote.length < 4) {
    return { status: "failed", reason: "No passage was quoted" };
  }
  const pages = document.pages.map(squash);
  const onPage = pages.findIndex((page) => page.includes(quote)) + 1;
  if (claim.page !== undefined) {
    if (claim.page < 1 || claim.page > pages.length) {
      return {
        status: "failed",
        reason: `"${claim.document}" has no page ${claim.page}`,
      };
    }
    if (!pages[claim.page - 1]!.includes(quote)) {
      return {
        status: "failed",
        reason: onPage
          ? `The passage is on page ${onPage}, not page ${claim.page}`
          : `The passage is not in "${claim.document}"`,
      };
    }
  } else if (!onPage) {
    return {
      status: "failed",
      reason: `The passage is not in "${claim.document}"`,
    };
  }
  const missing = claim.values.find((value) => !statesValue(claim.quote, value));
  if (missing) {
    return {
      status: "failed",
      reason: `The passage does not state ${missing.value} ${missing.unit}`,
    };
  }
  return { status: "verified", page: claim.page ?? onPage };
}
