import { CircleCheckIcon, FileTextIcon } from "lucide-react";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";
import { DocumentTags, type Verdicts } from "@/twin/Citation";
import { documentUrl } from "@/twin/api";
import type { AttachedPack } from "@/twin/demo-pack";
import {
  type KeptDocument,
  STATION_PARAMS,
  type SavedMachine,
  paramsFor,
} from "@/twin/project";

import { t } from "@/lib/i18n";
const labelOf = (key: string) =>
  STATION_PARAMS.find((param) => param.key === key)?.label ?? key;

/** What one document supplied to a machine: figures it set, ranges it gave. */
function supplied(machine: SavedMachine, document: KeptDocument) {
  const wanted = paramsFor(machine).map(({ key }) => key);
  const values = wanted.filter((key) => {
    const source = machine.params?.[key]?.provenance;
    return source?.kind === "doc" && source.document === document.name;
  });
  const ranges = wanted.filter(
    (key) => machine.baselines?.[key]?.document === document.name,
  );
  return { values, ranges };
}

/**
 * The documents behind a demo world's sim: its pack, machine by machine, and
 * what each document supplied. Only a sample opened with a pack has one.
 */
export function DocumentsTab({
  projectId,
  pack,
  machines,
  verdicts,
}: {
  projectId: string;
  pack: AttachedPack;
  machines: SavedMachine[];
  verdicts: Record<string, Verdicts>;
}) {
  const all = Object.values(verdicts).flatMap((byKey) => Object.values(byKey));
  const verified = all.filter(
    (verdict) => verdict !== "checking" && verdict.status === "verified",
  ).length;
  const checking = all.some((verdict) => verdict === "checking");
  const plantDocuments = pack.documents.filter(({ machine }) => !machine);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">{t("Documents behind this sim")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Every figure this")} {pack.plant}{" "}
          {t(
            "sim runs on was read by an agent from these documents, and cites the passage it came from.",
          )}{" "}
          <span className={ui.fair}>{t("Demo")}</span>{" "}
          {t("documents are made up for a fictional plant;")}{" "}
          <span className="text-info">{t("published")}</span>{" "}
          {t(
            "reference sheets carry real figures for each class of equipment.",
          )}
        </p>
        {all.length > 0 && (
          <p
            className={cn(
              "mt-2 flex items-center gap-1.5 text-sm",
              !checking && verified === all.length ? ui.good : "",
            )}
          >
            <CircleCheckIcon className="size-4 shrink-0" />
            {checking
              ? t("Checking every citation against its document…")
              : t("{0} of {1} citations verified against their documents.", {
                  0: verified,
                  1: all.length,
                })}
          </p>
        )}
      </div>

      {plantDocuments.map((document) => (
        <a
          key={document.id}
          href={documentUrl(projectId, document.id)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 rounded-2xl border border-border p-3 text-sm hover:border-ink"
        >
          <FileTextIcon className="size-4 shrink-0" />
          <span className="flex-1">
            <span className="font-medium">{t(document.title)}</span>
            {document.costs && (
              <span className="block text-xs text-muted-foreground">
                {t("Supplied the cost rates in the Cost tab.")}
              </span>
            )}
          </span>
          {document.demo && (
            <span className={cn(ui.tag, ui.tagAssumed)}>{t("Demo")}</span>
          )}
        </a>
      ))}

      {machines.map((machine) => {
        const kept = machine.kept ?? [];
        if (kept.length === 0) return null;
        return (
          <section
            key={machine.id}
            className="rounded-2xl border border-border p-3"
          >
            <h3 className="mb-2 text-sm font-semibold">
              {machine.name}
              {(machine.count ?? 1) > 1 ? ` ×${machine.count}` : ""}
              {machine.auxiliary && (
                <span className="ml-1.5 font-normal text-muted-foreground">
                  {t("support")}
                </span>
              )}
            </h3>
            <ul className="flex flex-col gap-2.5">
              {kept.map((document) => {
                const { values, ranges } = supplied(machine, document);
                return (
                  <li key={document.id} className="text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <a
                        href={documentUrl(projectId, document.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {t(document.title ?? document.name)}
                      </a>
                      <DocumentTags document={document} />
                    </div>
                    <p className="mt-0.5 text-muted-foreground">
                      {values.length > 0
                        ? `Supplied ${values.map(labelOf).join(", ").toLowerCase()}.`
                        : ranges.length > 0
                          ? t(
                              "Published range for {0}, shown beside this plant's figures.",
                              {
                                0: ranges
                                  .map(labelOf)
                                  .join(" and ")
                                  .toLowerCase(),
                              },
                            )
                          : t("No figure was read from it.")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
