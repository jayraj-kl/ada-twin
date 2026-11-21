import {
  COST_RATES,
  type CostRateKey,
  type Currency,
  SHIFTS_PER_YEAR,
  inCurrency,
  traceNumbers,
} from "@repo/sim";
import {
  CircleCheckIcon,
  PencilIcon,
  RefreshCwIcon,
  SparklesIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { setState, useStateValue } from "@/lib/project-store";
import { readJson, writeJson } from "@/lib/storage";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { TracedText } from "@/plant/TracedText";
import { verdictMark } from "@/twin/Citation";
import {
  type Verdict,
  costBrief,
  documentUrl,
  verifyCitations,
} from "@/twin/api";
import { type AttachedPack, DEMO_PACK_KEY } from "@/twin/demo-pack";
import {
  COST_RATES_KEY,
  type CostLine,
  type CostedRun,
  EXCHANGE_NOTE,
  type Losses,
  type StoredRates,
  amount,
  costReport,
  measureLosses,
  ratesOf,
} from "./cost";

import { t } from "@/lib/i18n";
const CURRENCY_KEY = "ada-twin:cost-view-currency";
const COST_BRIEF_KEY = "twin-cost-brief";

/** The brief as kept with the project, with the figures it was written from. */
interface KeptBrief {
  facts: string;
  text: string;
}

function Lines({
  lines,
  currency,
  signed = false,
}: {
  lines: CostLine[];
  currency: Currency;
  signed?: boolean;
}) {
  return (
    <ul className="divide-y divide-border text-sm">
      {lines.map((line) => {
        // A sign only where the amount does not round to nothing.
        const shown = Math.round(inCurrency(line.rupees, currency));
        return (
          <li
            key={line.label}
            className="flex items-baseline justify-between gap-3 py-2"
          >
            <span className="min-w-0">
              {line.label}
              <span className="block text-xs text-muted-foreground">
                {line.detail}
              </span>
            </span>
            <span
              className={cn(
                "shrink-0 font-mono tabular-nums",
                signed && shown !== 0 && (shown > 0 ? ui.good : ui.poor),
              )}
            >
              {signed && shown > 0 ? "+" : signed && shown < 0 ? "−" : ""}
              {amount(Math.abs(line.rupees), currency)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The four rates, where each came from, and a form to set them. */
function Rates({
  projectId,
  stored,
  currency,
}: {
  projectId: string;
  stored: StoredRates | undefined;
  currency: Currency;
}) {
  const pack = useStateValue(projectId, DEMO_PACK_KEY) as
    AttachedPack | undefined;
  const missing = COST_RATES.some(({ key }) => stored?.[key] === undefined);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Record<CostRateKey, string>>>({});
  const [verdicts, setVerdicts] = useState<
    Partial<Record<CostRateKey, Verdict>>
  >({});

  // Rates read from a document are checked against it on every visit.
  const cited = COST_RATES.flatMap(({ key }) => {
    const rate = stored?.[key];
    return rate?.source.kind === "doc"
      ? [{ key, rate, source: rate.source }]
      : [];
  });
  const citedKey = JSON.stringify(cited);
  useEffect(() => {
    const documents = (pack?.documents ?? []).map(({ id, file }) => ({
      id,
      name: file,
    }));
    if (cited.length === 0 || documents.length === 0) return;
    let cancelled = false;
    verifyCitations(
      projectId,
      documents,
      cited.map(({ rate, source }) => ({
        document: source.document,
        page: source.page,
        quote: source.quote,
        values: [{ value: rate.value, unit: "INR" }],
      })),
    )
      .then((answers) => {
        if (!cancelled) {
          setVerdicts(
            Object.fromEntries(
              cited.map(({ key }, index) => [key, answers[index]!]),
            ),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `citedKey` stands for the cited rates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citedKey, pack, projectId]);

  function save() {
    const next: StoredRates = { ...stored };
    for (const { key } of COST_RATES) {
      const text = draft[key];
      if (text === undefined || text.trim() === "") continue;
      const value = Number(text.replaceAll(",", ""));
      if (!Number.isFinite(value) || value < 0) continue;
      if (value !== stored?.[key]?.value)
        next[key] = { value, source: { kind: "user" } };
    }
    setState(projectId, COST_RATES_KEY, next);
    setEditing(false);
  }

  return (
    <div className={ui.panel}>
      <div className={ui.panelTitle}>
        <span>{t("Cost rates")}</span>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setDraft(
                Object.fromEntries(
                  COST_RATES.map(({ key }) => [
                    key,
                    stored?.[key]?.value?.toString() ?? "",
                  ]),
                ),
              );
              setEditing(true);
            }}
            className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            <PencilIcon className="size-3" />{" "}
            {missing ? t("Set rates") : t("Edit")}
          </button>
        )}
      </div>
      {editing ? (
        <form
          className="flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          {COST_RATES.map(({ key, label, meaning, per }) => (
            <label key={key} className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-foreground">
                {t(label)}{" "}
                <span className="text-muted-foreground">
                  {t("(₹ per {0})", { 0: per })}
                </span>
              </span>
              <span className="text-muted-foreground">{t(meaning)}</span>
              <input
                inputMode="decimal"
                className={cn(ui.input, "h-8")}
                value={draft[key] ?? ""}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <div className="flex gap-2">
            <button type="submit" className={cn(ui.button, ui.primary)}>
              {t("Save rates")}
            </button>
            <button
              type="button"
              className={ui.button}
              onClick={() => setEditing(false)}
            >
              {t("Cancel")}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "Rates are kept in rupees. Ones you type are marked as set by you.",
            )}
          </p>
        </form>
      ) : (
        <ul className="divide-y divide-border text-sm">
          {COST_RATES.map(({ key, label, per }) => {
            const rate = stored?.[key];
            const source = rate?.source;
            const document =
              source?.kind === "doc"
                ? pack?.documents.find(({ file }) => file === source.document)
                : undefined;
            return (
              <li
                key={key}
                className="flex items-start justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  {t(label)}
                  <span className="mt-0.5 block text-xs">
                    {!rate ? (
                      <span className={cn(ui.tag, ui.tagAssumed)}>
                        {t("Not set")}
                      </span>
                    ) : source?.kind === "doc" ? (
                      <a
                        href={
                          document
                            ? `${documentUrl(projectId, document.id)}#page=${source.page ?? 1}`
                            : undefined
                        }
                        target="_blank"
                        rel="noreferrer"
                        title={`“${source.quote}”`}
                        className={cn(
                          ui.tag,
                          verdicts[key] && verdicts[key]!.status !== "verified"
                            ? "border-current text-destructive"
                            : ui.tagDoc,
                        )}
                      >
                        {t(document?.title ?? source.document)}
                        {source.page ? ` p. ${source.page}` : ""}
                        {verdictMark(verdicts[key])}
                      </a>
                    ) : (
                      <span className={cn(ui.tag, ui.tagUser)}>
                        {t("Set by you")}
                      </span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 font-mono tabular-nums">
                  {rate
                    ? `${amount(rate.value, currency, { cents: true })}/${t(per)}`
                    : "–"}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Cost feedback on the shift that ran: where it lost money and to what,
 * which machine's breakdowns cost most, what the agents' playbook saves or
 * costs against standard rules, and a short brief whose numbers are traced
 * back to these figures.
 */
export function CostTab({
  projectId,
  run,
  runKey,
  days,
  unit,
  plant,
  hasAgents,
}: {
  projectId: string;
  run: CostedRun;
  /** Changes whenever another run is shown. */
  runKey: string;
  days: number;
  unit: string;
  plant: string;
  hasAgents: boolean;
}) {
  const stored = useStateValue(projectId, COST_RATES_KEY) as
    StoredRates | undefined;
  const rates = ratesOf(stored);
  const [currency, setCurrency] = useState<Currency>(() =>
    readJson<Currency>(CURRENCY_KEY) === "USD" ? "USD" : "INR",
  );
  const choose = (next: Currency) => {
    setCurrency(next);
    writeJson(CURRENCY_KEY, next);
  };

  // The shift measured again with no breakdowns, and each machine's taken out.
  const [losses, setLosses] = useState<{ key: string; losses: Losses } | null>(
    null,
  );
  const [progress, setProgress] = useState<[number, number] | null>(null);
  const [problem, setProblem] = useState("");
  // Measured again once the crew's playbook arrives, to cost the agents.
  const measureKey = `${runKey}|${days}|${run.playbook ? "playbook" : "rules"}`;
  useEffect(() => {
    if (losses?.key === measureKey) return;
    let cancelled = false;
    setProblem("");
    measureLosses(
      run,
      days,
      (done, total) => !cancelled && setProgress([done, total]),
    )
      .then(
        (result) =>
          !cancelled && setLosses({ key: measureKey, losses: result }),
      )
      .catch(
        (error: unknown) =>
          !cancelled &&
          setProblem(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => !cancelled && setProgress(null));
    return () => {
      cancelled = true;
    };
    // Measured once per run; `run` is read for that run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measureKey]);

  const report = useMemo(
    () =>
      losses?.key === measureKey && rates
        ? costReport(losses.losses, rates, { currency, unit })
        : null,
    [losses, measureKey, rates, currency, unit],
  );

  // The brief, written once per set of figures, kept with the project.
  const kept = useStateValue(projectId, COST_BRIEF_KEY) as
    KeptBrief | undefined;
  const facts = report?.facts.join("\n") ?? "";
  const brief = kept?.facts === facts ? kept.text : null;
  const [writing, setWriting] = useState(false);
  const [writeProblem, setWriteProblem] = useState("");
  const asked = useRef(new Set<string>());
  const write = () => {
    if (!report) return;
    setWriting(true);
    setWriteProblem("");
    costBrief({ plant, unit, facts: report.facts })
      .then((text) => setState(projectId, COST_BRIEF_KEY, { facts, text }))
      .catch((error: unknown) =>
        setWriteProblem(error instanceof Error ? error.message : String(error)),
      )
      .finally(() => setWriting(false));
  };
  useEffect(() => {
    if (!report || brief !== null || asked.current.has(facts)) return;
    asked.current.add(facts);
    write();
    // `facts` stands for the report.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facts, brief]);
  const traced = useMemo(
    () => (brief && report ? traceNumbers(brief, report.sources) : null),
    [brief, report],
  );
  const misses = traced?.flatMap((piece) =>
    piece.number && piece.source === null ? [piece.text] : [],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className={ui.spread}>
        <h2 className="font-semibold">{t("What this shift cost")}</h2>
        <div
          role="radiogroup"
          aria-label={t("Currency")}
          className="flex rounded-full border border-border p-0.5 text-xs font-semibold"
        >
          {(["INR", "USD"] as const).map((code) => (
            <button
              key={code}
              type="button"
              role="radio"
              aria-checked={currency === code}
              onClick={() => choose(code)}
              className={cn(
                "rounded-full px-2.5 py-1",
                currency === code
                  ? "bg-primary text-[#14140f]"
                  : "text-muted-foreground",
              )}
            >
              {code === "INR" ? "₹ INR" : "$ USD"}
            </button>
          ))}
        </div>
      </div>
      {currency === "USD" && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {t("Rates are kept in rupees; dollars at {0}.", { 0: EXCHANGE_NOTE })}
        </p>
      )}

      <Rates projectId={projectId} stored={stored} currency={currency} />

      {!rates ? (
        <p className="text-sm text-muted-foreground">
          {t("Set the four rates above to see what this shift cost.")}
        </p>
      ) : problem ? (
        <p className={cn(ui.poor, "text-sm")}>
          {t("The shift could not be measured: {0}", { 0: problem })}
        </p>
      ) : !report ? (
        <p className="text-sm text-muted-foreground">
          {losses?.key === measureKey
            ? t(
                "This run has no crew work counted. Run the shift again to cost it.",
              )
            : t(
                "Measuring the shift with and without each machine's breakdowns{0}…",
                { 0: progress ? ` (${progress[0]} of ${progress[1]})` : "" },
              )}
        </p>
      ) : (
        <>
          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              <span className="flex items-center gap-1.5">
                <SparklesIcon className="size-4" /> {t("Cost feedback")}
              </span>
              {!writing && (
                <button
                  type="button"
                  onClick={write}
                  className="flex items-center gap-1 text-xs font-normal text-muted-foreground hover:text-foreground"
                >
                  <RefreshCwIcon className="size-3" />{" "}
                  {brief ? t("Rewrite") : t("Write")}
                </button>
              )}
            </div>
            {writing ? (
              <p className="text-sm text-muted-foreground">
                {t("Gemini is writing the feedback…")}
              </p>
            ) : writeProblem ? (
              <p className="text-sm text-muted-foreground">
                {t(
                  "The feedback could not be written ({0}). The figures below stand on their own.",
                  { 0: writeProblem },
                )}
              </p>
            ) : traced ? (
              <>
                <p className="text-sm">
                  <TracedText pieces={traced} />
                </p>
                {misses && misses.length > 0 ? (
                  <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                    <TriangleAlertIcon className="mt-px size-3.5 shrink-0 text-warning" />
                    {misses.length === 1
                      ? t("1 number couldn't")
                      : t("{0} numbers couldn't", { 0: misses.length })}{" "}
                    {t("be traced to these figures:")} {misses.join(", ")}
                  </p>
                ) : (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CircleCheckIcon className="size-3.5 shrink-0 text-success" />
                    {t("Every number in it traces to the figures below.")}
                  </p>
                )}
              </>
            ) : null}
          </div>

          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              <span>{t("Where the shift lost money")}</span>
              <span className="font-mono tabular-nums">
                {amount(report.total, currency)}
              </span>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t("Per shift, as")}{" "}
              {losses!.losses.policy === "playbook"
                ? t("the crew's playbook")
                : t("standard rules")}{" "}
              {t("ran it, averaged over")} {losses!.losses.days} {t("days.")}{" "}
              {amount(report.total * SHIFTS_PER_YEAR, currency)}{" "}
              {t("a year at")} {SHIFTS_PER_YEAR} {t("shifts.")}
            </p>
            <Lines lines={report.lost} currency={currency} />
          </div>

          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              <span>{t("Breakdowns, machine by machine")}</span>
            </div>
            <p className="mb-1 text-xs text-muted-foreground">
              {t(
                "What each machine's breakdowns cost a shift: the output gained when only its failures are taken out, plus its repairs. Together they need not add up to the output lost, since breakdowns overlap.",
              )}
            </p>
            <Lines lines={report.machines} currency={currency} />
          </div>

          <div className={ui.panel}>
            <div className={ui.panelTitle}>
              <span>{t("Agents against standard rules")}</span>
              {report.agents && (
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    report.agents.net >= 0 ? ui.good : ui.poor,
                  )}
                >
                  {report.agents.net >= 0 ? "saves " : "costs "}
                  {amount(Math.abs(report.agents.net), currency)}
                </span>
              )}
            </div>
            {report.agents ? (
              <>
                <p className="mb-1 text-xs text-muted-foreground">
                  {t(
                    "The crew's playbook against standard rules on the same days, per shift;",
                  )}{" "}
                  {amount(
                    Math.abs(report.agents.net) * SHIFTS_PER_YEAR,
                    currency,
                  )}{" "}
                  {t("a year.")}
                </p>
                <Lines lines={report.agents.lines} currency={currency} signed />
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {hasAgents
                  ? t(
                      "Once the crew's playbook is written, it is compared with standard rules here.",
                    )
                  : t(
                      "No agents ran this shift. Put a crew on the floor in the Agents step to compare.",
                    )}
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
