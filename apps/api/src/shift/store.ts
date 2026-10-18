import { randomUUID } from "node:crypto";
import { insertRun } from "@repo/db/queries/insert";
import { selectLatestRun } from "@repo/db/queries/select";
import { updateRun } from "@repo/db/queries/update";
import type { SimEvent } from "@repo/sim";
import {
  deleteFile,
  projectPath,
  readJson,
  storageConfigured,
  writeJson,
} from "../storage";
import type { KeptRun, RunRecord, RunStore } from "./runner";

// A run with changes is kept under one name per project, replaced each time.
const trialPath = (projectId: string) =>
  projectPath(projectId, "runs", "trial.json");

interface KeptTrial {
  key: string;
  run: RunRecord;
}

/**
 * Runs kept in Cloud Storage and Postgres: a latest run is a database row
 * with its event log in the bucket; a run with changes is one file in the
 * bucket, so it never becomes the latest run. Null when the bucket is not
 * configured, and nothing is kept.
 */
export function cloudRunStore(): RunStore | null {
  if (!storageConfigured()) return null;
  return {
    async keep(projectId, purpose, run): Promise<KeptRun> {
      if (purpose.kind === "trial") {
        const path = trialPath(projectId);
        await writeJson(path, { key: purpose.key, run } satisfies KeptTrial);
        return {
          addPlaybook: (playbook) =>
            writeJson(path, {
              key: purpose.key,
              run: { ...run, playbook },
            } satisfies KeptTrial),
        };
      }
      if (!process.env.DATABASE_URL) throw new Error("No database to keep runs in");
      const id = randomUUID();
      const eventsPath = projectPath(projectId, "runs", id, "events.json");
      await writeJson(eventsPath, run.events);
      const { events: _, playbook: __, id: ___, ...row } = run;
      await insertRun({ ...row, id, projectId, status: "finished", eventsPath });
      return {
        id,
        addPlaybook: async (playbook) => {
          await updateRun(id, { playbook });
        },
      };
    },

    async latest(projectId) {
      const row = await selectLatestRun(projectId);
      // Every run is kept finished, with its numbers.
      if (!row?.baseline || !row.kpis) return null;
      const events = row.eventsPath
        ? await readJson<SimEvent[]>(row.eventsPath)
        : null;
      return {
        id: row.id,
        seed: row.seed,
        horizon: row.horizon,
        maintenanceCrews: row.maintenanceCrews,
        tickMinutes: row.tickMinutes,
        scenario: row.scenario,
        graph: row.graph,
        agents: row.agents,
        adjustments: row.adjustments,
        baseline: row.baseline,
        days: row.days ?? [row.baseline],
        kpis: row.kpis,
        events: events ?? [],
        decisions: row.decisions,
        playbook: row.playbook ?? undefined,
      };
    },

    trial: (projectId) => readJson<KeptTrial>(trialPath(projectId)),

    forgetTrial: (projectId) => deleteFile(trialPath(projectId)),
  };
}
