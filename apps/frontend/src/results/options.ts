import { language, t } from "@/lib/i18n";

// The options an agent chose between are written by the agent package in
// English, as its prompts list them. The page shows them in its language by
// their few fixed shapes; names inside them stay as the twin spells them.

const SHAPES: [RegExp, (match: RegExpMatchArray) => string][] = [
  [/^Change nothing$/, () => t("Change nothing")],
  [
    /^Release (.+) at (\d+)% of the nominal rate$/,
    ([, source, percent]) =>
      t("Release {0} at {1}% of the nominal rate", { 0: source, 1: percent }),
  ],
  [
    /^Take (one unit of |the most worn unit of )?(.+?) out for preventive servicing(?: \(stops (.+) meanwhile\))?$/,
    ([, unit, name, stops]) => {
      const what = unit
        ? t(
            unit.startsWith("one")
              ? "one unit of {0}"
              : "the most worn unit of {0}",
            {
              0: name,
            },
          )
        : name!;
      return stops
        ? t("Take {0} out for preventive servicing (stops {1} meanwhile)", {
            0: what,
            1: stops,
          })
        : t("Take {0} out for preventive servicing", { 0: what });
    },
  ],
  [
    /^(Repair|Service) (.+?)( unit (\d+))? \(waiting (\d+) min(?:; (.+) stopped until it is fixed|; servicing it stops (.+) meanwhile)?\)$/,
    ([, task, name, , unit, waited, stoppedUntilFixed, stopsMeanwhile]) => {
      const what = unit ? t("{0} unit {1}", { 0: name, 1: unit }) : name!;
      const job =
        task === "Repair"
          ? t("Repair {0} (waiting {1} min)", { 0: what, 1: waited })
          : t("Service {0} (waiting {1} min)", { 0: what, 1: waited });
      if (stoppedUntilFixed) {
        return `${job}; ${t("{0} stopped until it is fixed", { 0: stoppedUntilFixed })}`;
      }
      if (stopsMeanwhile) {
        return `${job}; ${t("servicing it stops {0} meanwhile", { 0: stopsMeanwhile })}`;
      }
      return job;
    },
  ],
];

/** An agent's option as the page shows it, in its language. */
export function optionLabel(text: string): string {
  if (language === "en") return text;
  for (const [shape, write] of SHAPES) {
    const match = text.match(shape);
    if (match) return write(match);
  }
  return text;
}
