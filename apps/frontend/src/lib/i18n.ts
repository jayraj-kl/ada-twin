import { HI } from "./hi";

// The app's language. English text is its own key: `t("Run the shift")`
// finds the Hindi in `hi.ts`, or shows the English where there is none yet.
// A language is picked once per browser, and switching reloads the page so
// that labels made when a module loads are in the new language too.

export type Language = "en" | "hi";

export const LANGUAGES: { code: Language; label: string; short: string }[] = [
  { code: "en", label: "English", short: "EN" },
  { code: "hi", label: "हिन्दी", short: "हिं" },
];

const KEY = "ada-twin:language";

function stored(): Language {
  try {
    return globalThis.localStorage?.getItem(KEY) === "hi" ? "hi" : "en";
  } catch {
    // A private window or blocked storage: English.
    return "en";
  }
}

/** The language this page load shows. */
export const language: Language = stored();

/** Switches the language and reloads the page in it. */
export function setLanguage(next: Language) {
  if (next === language) return;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    return;
  }
  window.location.reload();
}

/**
 * The text in the page's language. `{name}` in it is filled from `values`,
 * so a translation can put the values where its grammar wants them.
 */
export function t(
  text: string,
  values?: Record<string, string | number | boolean | null | undefined>,
): string {
  const template = language === "hi" ? (HI[text] ?? text) : text;
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values
      ? // As React shows them: false and null show nothing.
        values[key] === false || values[key] == null
        ? ""
        : String(values[key])
      : match,
  );
}

/** Numbers in the page's language; digits stay 0–9 in Hindi too. */
export const locale = language === "hi" ? "hi-IN-u-nu-latn" : undefined;
