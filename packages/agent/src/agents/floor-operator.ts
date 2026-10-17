import {
  type BaseLlm,
  FunctionTool,
  Gemini,
  InMemoryRunner,
  type LlmRequest,
  type LlmResponse,
  LlmAgent,
} from "@google/adk";
import { since } from "@repo/logger";
import type { Decision, DecisionRequest, Policy, Snapshot } from "@repo/sim";
import { z } from "zod";
import {
  RATE_LIMIT_FIRST_DELAY_SECONDS,
  RATE_LIMIT_RETRIES,
  isRateLimited,
  log,
  textModelId,
  vertexSettings,
} from "../model";
import { type AgentSpec, PERSONAS, ROLES, type RoleDefinition } from "../roles";

const APP_NAME = "factory-twin";

export interface AgentPolicyOptions {
  agents: AgentSpec[];
  /** What the factory is trying to achieve this run, in plain words. */
  goal: string;
  /** A model instance; defaults to the one the environment configures. */
  model?: BaseLlm;
  onDecision?: (record: DecisionRecord) => void;
}

/** One decision as an agent made it, for the run's decision feed. */
export interface DecisionRecord {
  agent: AgentSpec;
  kind: DecisionRequest["kind"];
  time: number;
  options: string[];
  choice: number;
  reason: string;
  /** Set when the agent failed to choose and the baseline choice was used. */
  fallback?: string;
}

/**
 * Gemini that waits and asks again when Vertex AI is out of capacity (429).
 * ADK's Gemini takes no retry settings, so the retry wraps its calls.
 */
class PatientGemini extends Gemini {
  override async *generateContentAsync(
    llmRequest: LlmRequest,
    stream?: boolean,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    for (let attempt = 0; ; attempt++) {
      let answered = false;
      try {
        for await (const response of super.generateContentAsync(
          llmRequest,
          stream,
          abortSignal,
        )) {
          answered = true;
          yield response;
        }
        return;
      } catch (error) {
        if (answered || attempt >= RATE_LIMIT_RETRIES || !isRateLimited(error)) {
          throw error;
        }
        const seconds = RATE_LIMIT_FIRST_DELAY_SECONDS * 2 ** attempt;
        log.warn("gemini is busy (429), asking again", {
          model: this.model,
          retryInSeconds: seconds,
          attempt: `${attempt + 1}/${RATE_LIMIT_RETRIES}`,
        });
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      }
    }
  }
}

function modelFromEnvironment(): BaseLlm {
  return new PatientGemini({
    model: textModelId(),
    vertexai: true,
    ...vertexSettings(),
  });
}

const clock = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
};

function describeFactory(snapshot: Snapshot): string {
  return [
    `Time into shift: ${clock(snapshot.time)}. Shipped ${snapshot.completed}, scrapped ${snapshot.scrapped}, in progress ${snapshot.wip}. Free maintenance crews: ${snapshot.freeCrews}.`,
    "Stations:",
    ...snapshot.stations.map(
      (station) =>
        `- ${station.name}: ${station.status}, ${station.busyUnits}/${station.units} machines working${station.unitsDown ? `, ${station.unitsDown} out` : ""}, ${station.wearHours.toFixed(1)} h worked since last repair or service`,
    ),
    "Buffers:",
    ...snapshot.buffers.map(
      (buffer) => `- ${buffer.name}: ${buffer.level}/${buffer.capacity} parts`,
    ),
    "Sources:",
    ...snapshot.sources.map(
      (source) =>
        `- ${source.name}: releasing at ${Math.round(source.releaseFactor * 100)}%${source.blocked ? ", blocked by a full line" : ""}${source.stopped ? ", stopped because support equipment it needs is down" : ""}`,
    ),
    ...(snapshot.supports?.length
      ? [
          "Support equipment (handles no parts; what needs it stops while any unit is out):",
          ...snapshot.supports.map(
            (support) =>
              `- ${support.name}: ${support.status}, ${support.unitsDown}/${support.units} units out${support.neededBy.length ? `, needed by ${support.neededBy.join(", ")}` : ""}, ${support.wearHours.toFixed(1)} h worked since last repair or service`,
          ),
        ]
      : []),
  ].join("\n");
}

/**
 * A simulation policy whose decisions are made by Gemini agents, one per
 * `AgentSpec`. Each agent keeps its own conversation for the whole run, so it
 * remembers what it has already decided. A role nobody holds, or an agent
 * that fails to answer, falls back to the baseline choice so a run never
 * stalls.
 */
export function createAgentPolicy(options: AgentPolicyOptions): Policy {
  const model = options.model ?? modelFromEnvironment();

  const seats = options.agents.map((spec) => {
    const role = ROLES[spec.role];
    // The tool writes here; `decide` reads it once the agent's turn ends.
    const answer: { current: Decision | null } = { current: null };
    const choose = new FunctionTool({
      name: "choose_option",
      description:
        "Commit to one of the numbered options for the current decision.",
      parameters: z.object({
        option: z.number().int().describe("The number of the chosen option"),
        reason: z
          .string()
          .describe("One sentence, in your own voice, on why you chose it"),
      }),
      execute: ({ option, reason }, context) => {
        answer.current = { choice: option - 1, reason };
        // The choice is the whole answer; no follow-up model call is needed.
        if (context) context.actions.skipSummarization = true;
        return { status: "recorded" };
      },
    });
    const runner = new InMemoryRunner({
      appName: APP_NAME,
      agent: new LlmAgent({
        name: spec.id.replace(/[^A-Za-z0-9_]/g, "_"),
        model,
        instruction: [
          `You are ${spec.name}, the ${role.title.toLowerCase()} of a factory. ${role.duty}`,
          PERSONAS[spec.persona],
          spec.trait && `About you: ${spec.trait}`,
          `The factory's goal this shift: ${options.goal}`,
          "At each decision you are shown the state of the factory and a numbered list of options. Call choose_option exactly once with the number you pick and a one-sentence reason. Never answer in plain text.",
        ]
          .filter(Boolean)
          .join("\n\n"),
        tools: [choose],
      }),
    });
    return { spec, runner, answer, sessionId: null as string | null };
  });

  const turns = new Map<string, number>();

  return {
    async decide(request) {
      // Agents sharing a role take turns.
      const holders = seats.filter((seat) => seat.spec.role === request.role);
      if (holders.length === 0) return { choice: 0 };
      const turn = turns.get(request.role) ?? 0;
      turns.set(request.role, turn + 1);
      const seat = holders[turn % holders.length]!;

      // The request's role picks its own definition; TypeScript cannot see that.
      const role = ROLES[request.role] as RoleDefinition;
      const labels = role.describeOptions(request);
      const prompt = [
        describeFactory(request.snapshot),
        "",
        role.question,
        ...labels.map((label, index) => `${index + 1}. ${label}`),
      ].join("\n");

      seat.answer.current = null;
      const started = performance.now();
      let fallback: string | undefined;
      try {
        seat.sessionId ??= (
          await seat.runner.sessionService.createSession({
            appName: APP_NAME,
            userId: seat.spec.id,
          })
        ).id;
        const events = seat.runner.runAsync({
          userId: seat.spec.id,
          sessionId: seat.sessionId,
          newMessage: { role: "user", parts: [{ text: prompt }] },
        });
        for await (const event of events) {
          if (event.errorMessage) fallback = event.errorMessage;
        }
      } catch (error) {
        fallback = error instanceof Error ? error.message : String(error);
      }

      const answer = seat.answer.current as Decision | null;
      const valid = answer !== null && labels[answer.choice] !== undefined;
      if (!valid) {
        fallback ??=
          answer === null
            ? "The agent did not choose an option"
            : `The agent chose option ${answer.choice + 1}, which does not exist`;
      }
      const decision: Decision = valid
        ? answer
        : { choice: 0, reason: `Baseline choice used: ${fallback}` };
      const fields = {
        task: "floor-decision",
        agent: seat.spec.name,
        role: request.role,
        kind: request.kind,
        choice: labels[decision.choice],
        ms: since(started),
      };
      if (valid) log.info("agent decided", fields);
      else log.warn("agent fell back to the baseline choice", { ...fields, fallback });
      options.onDecision?.({
        agent: seat.spec,
        kind: request.kind,
        time: request.snapshot.time,
        options: labels,
        choice: decision.choice,
        reason: decision.reason ?? "",
        fallback: valid ? undefined : fallback,
      });
      return decision;
    },
  };
}
