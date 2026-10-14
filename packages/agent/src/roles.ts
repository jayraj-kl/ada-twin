import type { DecisionRequest, Role } from "@repo/sim";
import { MAINTENANCE_TECHNICIAN } from "./agents/maintenance-technician";
import { PRODUCTION_PLANNER } from "./agents/production-planner";
import { SHIFT_SUPERVISOR } from "./agents/shift-supervisor";

/** Everything one role knows: who it is, and how its decision is put to it. */
export interface RoleDefinition<R extends Role = Role> {
  title: string;
  /** What this role decides, written for the agent that plays it. */
  duty: string;
  /** What the agent is asked each time its decision comes up. */
  question: string;
  /** One line per option of the decision, in the order the kernel gave them. */
  describeOptions(request: Extract<DecisionRequest, { role: R }>): string[];
}

/** Every role here has a real decision in the simulation kernel behind it. */
export const ROLES: { [R in Role]: RoleDefinition<R> } = {
  planner: PRODUCTION_PLANNER,
  maintenance: MAINTENANCE_TECHNICIAN,
  supervisor: SHIFT_SUPERVISOR,
};

export type Persona = "cautious" | "aggressive" | "by-the-book";

export const PERSONAS: Record<Persona, string> = {
  cautious:
    "You are cautious: you protect reliability and stable flow, and avoid moves that could backfire.",
  aggressive: "You are aggressive: you chase output and accept risk to get it.",
  "by-the-book":
    "You go by the book: you follow standard practice and only deviate with a clear reason.",
};

/** One agent the user has put on the factory floor. */
export interface AgentSpec {
  id: string;
  name: string;
  role: Role;
  persona: Persona;
  /** Optional free-text character note from the user. */
  trait?: string;
}
