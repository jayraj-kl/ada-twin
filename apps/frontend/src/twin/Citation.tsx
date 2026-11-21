import {
  type Baseline,
  type Citation,
  citationsOf,
  rangeStatus,
} from "@repo/sim";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  CircleHelpIcon,
  ExternalLinkIcon,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { type Param, type Verdict, documentUrl, verifyCitations } from "./api";
import { LABEL } from "./demo-pack";
import type { KeptDocument, SavedMachine } from "./project";

import { t } from "@/lib/i18n";
type DocProvenance = Extract<Param["provenance"], { kind: "doc" }>;

/** Verdicts for one machine's citations, by `role:key`. */
export type Verdicts = Record<string, Verdict | "checking">;

const signature = (machine: SavedMachine, citations: Citation[]) =>
  JSON.stringify([
    (machine.kept ?? []).map(({ id, name }) => [id, name]),
    citations.map(({ key, role, document, page, quote, values }) => [
      key,
      role,
      document,
      page,
      quote,
      values,
    ]),
  ]);

/**
 * Checks every cited figure of every machine against the documents kept for
 * it, again whenever a machine's figures or documents change.
 */
export function useCitationChecks(
  projectId: string,
  machines: SavedMachine[],
): Record<string, Verdicts> {
  const [verdicts, setVerdicts] = useState<
    Record<string, { signature: string; verdicts: Verdicts }>
  >({});
  const wanted = useMemo(
    () =>
      machines.flatMap((machine) => {
        const citations = citationsOf(machine.params, machine.baselines);
        return citations.length > 0
          ? [{ machine, citations, signature: signature(machine, citations) }]
          : [];
      }),
    [machines],
  );
  const key = wanted
    .map(({ machine, signature }) => `${machine.id}${signature}`)
    .join("\n");

  useEffect(() => {
    let cancelled = false;
    for (const { machine, citations, signature } of wanted) {
      if (verdicts[machine.id]?.signature === signature) continue;
      const pending: Verdicts = Object.fromEntries(
        citations.map(({ role, key }) => [
          `${role}:${key}`,
          "checking" as const,
        ]),
      );
      setVerdicts((current) => ({
        ...current,
        [machine.id]: { signature, verdicts: pending },
      }));
      const kept = machine.kept ?? [];
      void (
        kept.length === 0
          ? Promise.resolve(
              citations.map((): Verdict => ({
                status: "unverifiable",
                reason: t(
                  "None of the documents it cites is kept with this project",
                ),
              })),
            )
          : verifyCitations(
              projectId,
              kept.map(({ id, name }) => ({ id, name })),
              citations,
            )
      )
        .catch((error: unknown) =>
          citations.map((): Verdict => ({
            status: "unverifiable",
            reason: t("The check could not run ({0})", {
              0: error instanceof Error ? error.message : String(error),
            }),
          })),
        )
        .then((answers) => {
          if (cancelled) return;
          setVerdicts((current) =>
            current[machine.id]?.signature === signature
              ? {
                  ...current,
                  [machine.id]: {
                    signature,
                    verdicts: Object.fromEntries(
                      citations.map(({ role, key }, index) => [
                        `${role}:${key}`,
                        answers[index]!,
                      ]),
                    ),
                  },
                }
              : current,
          );
        });
    }
    return () => {
      cancelled = true;
    };
    // `key` covers `wanted`; the verdicts already held are read, not watched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, projectId]);

  return Object.fromEntries(
    Object.entries(verdicts).map(([id, { verdicts }]) => [id, verdicts]),
  );
}

/** Seconds as a reader would write them: hours once they are long. */
export function duration(seconds: number) {
  const hours = seconds / 3600;
  if (hours >= 1) {
    return `${hours.toLocaleString("en-US", { maximumFractionDigits: hours >= 100 ? 0 : 1 })} h`;
  }
  return `${Math.round(seconds / 60)} min`;
}

function VerdictLine({
  verdict,
}: {
  verdict: Verdict | "checking" | undefined;
}) {
  if (!verdict || verdict === "checking") {
    return (
      <span className="text-muted-foreground">
        {t("Checking the passage…")}
      </span>
    );
  }
  if (verdict.status === "verified") {
    return (
      <span className={cn("flex items-center gap-1", ui.good)}>
        <CircleCheckIcon className="size-3.5 shrink-0" />{" "}
        {t("Verified: the passage is on page")} {verdict.page}{" "}
        {t("and states this figure.")}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "flex items-start gap-1",
        verdict.status === "failed" ? ui.poor : "text-muted-foreground",
      )}
    >
      {verdict.status === "failed" ? (
        <CircleAlertIcon className="mt-px size-3.5 shrink-0" />
      ) : (
        <CircleHelpIcon className="mt-px size-3.5 shrink-0" />
      )}
      {verdict.status === "failed" ? t("Not verified") : t("Can't be verified")}
      : {verdict.reason}.
    </span>
  );
}

export function verdictMark(verdict: Verdict | "checking" | undefined) {
  if (!verdict || verdict === "checking") return "";
  return verdict.status === "verified"
    ? " ✓"
    : verdict.status === "failed"
      ? " ✗"
      : " ?";
}

const STATUS_TEXT = {
  within: t("within the published range"),
  outside: t("outside the published range"),
  "not-comparable": t("not yet comparable"),
} as const;

function DocLink({
  projectId,
  document,
  page,
  children,
}: {
  projectId: string;
  document: KeptDocument | undefined;
  page?: number;
  children: React.ReactNode;
}) {
  if (!document) return <>{children}</>;
  return (
    <a
      href={`${documentUrl(projectId, document.id)}${page ? `#page=${page}` : ""}`}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
    >
      {children}
      <ExternalLinkIcon className="size-3" />
    </a>
  );
}

/** A document's kind and whether it is made up, as small tags. */
export function DocumentTags({ document }: { document?: KeptDocument }) {
  if (!document?.kind) return null;
  return (
    <>
      <span className={ui.tag}>{LABEL[document.kind]}</span>
      {document.demo ? (
        <span className={cn(ui.tag, ui.tagAssumed)}>{t("Demo")}</span>
      ) : document.kind === "reference" ? (
        <span className={cn(ui.tag, ui.tagUser)}>{t("Published")}</span>
      ) : null}
    </>
  );
}

interface CitationProps {
  projectId: string;
  provenance: DocProvenance;
  param: Param;
  paramKey: string;
  kept: KeptDocument[];
  baseline?: Baseline;
  verdicts?: Verdicts;
  duty: number;
}

function useCitation({
  provenance,
  param,
  paramKey,
  kept,
  baseline,
  verdicts,
  duty,
}: CitationProps) {
  const document = kept.find(({ name }) => name === provenance.document);
  const verdict = provenance.quote
    ? verdicts?.[`value:${paramKey}`]
    : ({
        status: "unverifiable",
        reason: t(
          "It was read before figures carried their passage; find its parameters again to cite one",
        ),
      } satisfies Verdict);
  const baselineVerdict = verdicts?.[`baseline:${paramKey}`];
  const range =
    param.unit === "s" && (paramKey === "mtbf" || paramKey === "mttr")
      ? rangeStatus(param.value, baseline, { key: paramKey, duty })
      : null;
  return { document, verdict, baselineVerdict, range };
}

/**
 * A figure read from a document: a tag naming the page and whether the
 * citation checks out. It opens `CitationDetails`, which the row places.
 */
export function CitedSource({
  open,
  onToggle,
  ...props
}: CitationProps & { open: boolean; onToggle: () => void }) {
  const { provenance } = props;
  const { document, verdict, range } = useCitation(props);
  const failed =
    verdict !== "checking" &&
    verdict !== undefined &&
    verdict.status !== "verified";
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={cn(
          ui.tag,
          failed ? "border-current text-destructive" : ui.tagDoc,
          "max-w-full truncate",
        )}
        title={`${provenance.document}${provenance.page ? ` p. ${provenance.page}` : ""}`}
      >
        {t(document?.title ?? provenance.document)}
        {provenance.page ? ` p. ${provenance.page}` : ""}
        {verdictMark(verdict)}
      </button>
      {range && range.status !== "not-comparable" && (
        <span
          className={cn(
            "text-[11px]",
            range.status === "within" ? "text-muted-foreground" : ui.fair,
          )}
        >
          {t("{0} its class's published range", {
            0: range.status === "within" ? t("Within") : t("Outside"),
          })}
        </span>
      )}
    </div>
  );
}

/**
 * The passage a figure cites, whether it checks out, and how the figure
 * compares with its class's published range.
 */
export function CitationDetails(props: CitationProps) {
  const { projectId, provenance, param, paramKey, kept, baseline, duty } =
    props;
  const { document, verdict, baselineVerdict, range } = useCitation(props);
  return (
    <div className="mt-1 w-full rounded-xl border border-border bg-muted/40 p-3 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <DocLink
          projectId={projectId}
          document={document}
          page={provenance.page}
        >
          <strong>{t(document?.title ?? provenance.document)}</strong>
          {provenance.page ? t(", page {0}", { 0: provenance.page }) : ""}
        </DocLink>
        <DocumentTags document={document} />
      </div>
      {provenance.quote && (
        <blockquote className="mb-2 border-l-2 border-ink/40 pl-2 italic">
          “{provenance.quote}”
        </blockquote>
      )}
      <VerdictLine verdict={verdict} />
      {range && (
        <div className="mt-3 border-t border-border pt-2">
          {baseline ? (
            <>
              <p>
                {t("Published range for its class:")}{" "}
                <strong>
                  {t("{0} to {1}", {
                    0: duration(baseline.low),
                    1: duration(baseline.high),
                  })}
                </strong>
                {paramKey === "mtbf" && baseline.basis === "calendar" && (
                  <>
                    {" "}
                    in calendar hours, or from{" "}
                    <strong>{duration(range.low!)}</strong> counting only the
                    hours this plant runs ({Math.round(duty * 100)}% of the
                    year)
                  </>
                )}
                {t(". This plant's")} {duration(param.value)} {t("is")}{" "}
                <strong
                  className={range.status === "within" ? ui.good : ui.fair}
                >
                  {STATUS_TEXT[range.status]}
                </strong>
                .
              </p>
              <p className="mt-1 text-muted-foreground">
                {t("From")}{" "}
                <DocLink
                  projectId={projectId}
                  document={kept.find(({ name }) => name === baseline.document)}
                  page={baseline.page}
                >
                  {t(
                    kept.find(({ name }) => name === baseline.document)
                      ?.title ?? baseline.document,
                  )}
                  {baseline.page ? t(", page {0}", { 0: baseline.page }) : ""}
                </DocLink>
                : “{baseline.quote}”
              </p>
              <div className="mt-1">
                <VerdictLine verdict={baselineVerdict} />
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">
              {t(
                "No published range for its class: not yet comparable. Add a reference sheet to compare.",
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
