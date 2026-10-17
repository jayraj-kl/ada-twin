import { Link } from "react-router";
import {
  AGENTS_KEY,
  type AgentSpec,
  type CrewSettings,
  DEFAULT_CREW,
  PERSONA_LABELS,
  type Persona,
  ROLE_INFO,
  type Role,
  useStored,
} from "@/twin/project";
import { useProjectPath } from "@/lib/projects";
import { PlusIcon } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { NumberField } from "@/components/ui/number-field";
import { ui } from "@/lib/ui";
import { cn } from "@/lib/utils";

const MAX_AGENTS = 6;

export default function AgentsPage() {
  const path = useProjectPath();
  const [crew, setCrew] = useStored<CrewSettings>(AGENTS_KEY, DEFAULT_CREW);
  const { agents } = crew;

  const edit = (id: string, change: Partial<AgentSpec>) =>
    setCrew({
      ...crew,
      agents: agents.map((agent) =>
        agent.id === id ? { ...agent, ...change } : agent,
      ),
    });

  const emptyRoles = (Object.keys(ROLE_INFO) as Role[]).filter(
    (role) => !agents.some((agent) => agent.role === role),
  );

  return (
    <>
      <p className={ui.eyebrow}>Step 4 · Agents</p>
      <h1 className={ui.title}>Put a crew on the floor</h1>
      <p className={ui.lede}>
        Each agent holds one role and makes that role&apos;s decisions during
        the shift. Their personality changes how they trade output against risk.
        Roles you leave empty follow standard rules.
      </p>

      <div className={ui.grid3}>
        {agents.map((agent) => (
          <div key={agent.id} className={ui.panel}>
            <div className={ui.row} style={{ marginBottom: 12 }}>
              <Avatar
                seed={agent.name.trim().toLowerCase() || agent.id}
                className="size-11"
                alt=""
              />
              <div className={ui.field} style={{ flex: 1 }}>
                <label htmlFor={`${agent.id}-name`}>Name</label>
                <input
                  id={`${agent.id}-name`}
                  className={ui.input}
                  value={agent.name}
                  onChange={(event) =>
                    edit(agent.id, { name: event.target.value })
                  }
                />
              </div>
            </div>
            <div className={ui.stack} style={{ gap: 10 }}>
              <div className={ui.field}>
                <label htmlFor={`${agent.id}-role`}>Role</label>
                <select
                  id={`${agent.id}-role`}
                  className={ui.input}
                  value={agent.role}
                  onChange={(event) =>
                    edit(agent.id, { role: event.target.value as Role })
                  }
                >
                  {(Object.keys(ROLE_INFO) as Role[]).map((role) => (
                    <option key={role} value={role}>
                      {ROLE_INFO[role].title}
                    </option>
                  ))}
                </select>
              </div>
              <div className={ui.field}>
                <label htmlFor={`${agent.id}-persona`}>Personality</label>
                <select
                  id={`${agent.id}-persona`}
                  className={ui.input}
                  value={agent.persona}
                  onChange={(event) =>
                    edit(agent.id, { persona: event.target.value as Persona })
                  }
                >
                  {(Object.keys(PERSONA_LABELS) as Persona[]).map((persona) => (
                    <option key={persona} value={persona}>
                      {PERSONA_LABELS[persona]}
                    </option>
                  ))}
                </select>
              </div>
              <div className={ui.field}>
                <label htmlFor={`${agent.id}-trait`}>
                  About them (optional)
                </label>
                <input
                  id={`${agent.id}-trait`}
                  className={ui.input}
                  placeholder="e.g. You have seen the boilers fail before."
                  value={agent.trait ?? ""}
                  onChange={(event) =>
                    edit(agent.id, { trait: event.target.value || undefined })
                  }
                />
              </div>
              <p className={ui.hint}>
                Decides: {ROLE_INFO[agent.role].decides}
              </p>
              <button
                className={ui.button}
                style={{ alignSelf: "flex-start" }}
                onClick={() =>
                  setCrew({
                    ...crew,
                    agents: agents.filter(({ id }) => id !== agent.id),
                  })
                }
              >
                Remove
              </button>
            </div>
          </div>
        ))}

        {agents.length < MAX_AGENTS && (
          <button
            className={cn(ui.drop, "group content-center rounded-[28px] border-2")}
            onClick={() =>
              setCrew({
                ...crew,
                agents: [
                  ...agents,
                  {
                    id: `agent-${Date.now().toString(36)}`,
                    name: "New agent",
                    role: emptyRoles[0] ?? "maintenance",
                    persona: "by-the-book",
                  },
                ],
              })
            }
          >
            <span className="mb-2 grid size-12 place-items-center rounded-full border-2 border-ink bg-primary text-[#14140f] transition-transform duration-300 group-hover:rotate-90">
              <PlusIcon className="size-5" />
            </span>
            <strong>Add an agent</strong>
            <span>Up to {MAX_AGENTS} · two agents can share a role</span>
          </button>
        )}
      </div>

      <div className={ui.panel} style={{ marginTop: 20 }}>
        <div className={ui.row}>
          <div className={ui.field}>
            <label htmlFor="tick">
              Planner and supervisor check in every (minutes)
            </label>
            <NumberField
              id="tick"
              className="w-36"
              min={5}
              max={240}
              step={5}
              value={crew.tickMinutes}
              onValueChange={(minutes) =>
                setCrew({
                  ...crew,
                  tickMinutes: Math.min(240, Math.max(5, minutes ?? 30)),
                })
              }
            />
          </div>
          <p className={ui.hint}>
            {emptyRoles.length === 0
              ? "Every role has an agent."
              : `No agent for: ${emptyRoles.map((role) => ROLE_INFO[role].title.toLowerCase()).join(", ")}. ${emptyRoles.length === 1 ? "That role follows" : "Those roles follow"} standard rules.`}{" "}
            Each check-in is one question to Gemini per agent, so shorter
            intervals make the run take longer.
          </p>
        </div>
      </div>

      <div className={ui.actions}>
        <Link to={path("results")} className={cn(ui.button, ui.primary)}>
          Run the shift
        </Link>
        <Link to={path("scenario")} className={ui.button}>
          Back
        </Link>
      </div>
    </>
  );
}
