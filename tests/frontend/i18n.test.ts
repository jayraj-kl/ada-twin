import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { HI } from "../../apps/frontend/src/lib/hi";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

const frontend = sources(join(ROOT, "apps", "frontend", "src")).filter(
  (path) => !/[\\/]lib[\\/]hi/.test(path),
);
const code = frontend.map((path) => readFileSync(path, "utf8"));
// Text some screens show through a variable comes from the sim package.
const simCode = sources(join(ROOT, "packages", "sim", "src")).map((path) =>
  readFileSync(path, "utf8"),
);
// So does a demo pack's manifest: its documents' titles.
const worlds = join(ROOT, "apps", "frontend", "public", "worlds");
const packs = readdirSync(worlds).flatMap((world) => {
  try {
    return [readFileSync(join(worlds, world, "docs", "pack.json"), "utf8")];
  } catch {
    return [];
  }
});

/** A string literal's value, in either quote style. */
const literal = (quoted: string) =>
  quoted.startsWith("'")
    ? quoted.slice(1, -1).replace(/\\(.)/g, "$1")
    : (JSON.parse(quoted) as string);

/** Every string literal handed to t() or tr() as the text to translate. */
const keys = new Set(
  code.flatMap((text) =>
    [
      ...text.matchAll(
        /\b(?:t|tr)\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
      ),
    ].map((match) => literal(match[1]!)),
  ),
);

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe("Hindi", () => {
  it("has a translation for every text the app shows through t()", () => {
    const missing = [...keys].filter((key) => !(key in HI));
    expect(missing).toEqual([]);
  });

  it("keeps every value a text puts in, and adds none", () => {
    const changed = Object.entries(HI).filter(
      ([english, hindi]) =>
        placeholders(english).join() !== placeholders(hindi).join(),
    );
    expect(changed).toEqual([]);
  });

  it("writes Devanagari, with digits kept as 0-9", () => {
    for (const [english, hindi] of Object.entries(HI)) {
      expect(hindi, english).not.toMatch(/[०-९]/);
    }
    const untranslated = Object.entries(HI).filter(
      ([english, hindi]) =>
        hindi === english && /[a-z]{4}/.test(english) && !/^[A-Z][\w ]+$/.test(english),
    );
    expect(untranslated).toEqual([]);
  });

  it("has no translations left over from text the app no longer shows", () => {
    const everything = [...code, ...simCode, ...packs].join("\n");
    const stale = Object.keys(HI).filter(
      (english) => !keys.has(english) && !everything.includes(JSON.stringify(english)),
    );
    expect(stale).toEqual([]);
  });
});
