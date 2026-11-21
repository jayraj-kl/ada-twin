import type { StepSlug } from "@/lib/projects";

import { t } from "@/lib/i18n";
/**
 * One stop of a page's tour. `target` names a `data-tour` attribute on the
 * page; a stop without one is a card in the middle of the screen. Stops whose
 * target is not on the page right now (a sample project, a panel that is
 * closed, a phone layout) are left out of that run of the tour.
 */
export interface TourStop {
  target?: string;
  title: string;
  body: string;
}

export const TOURS: Record<StepSlug, TourStop[]> = {
  capture: [
    {
      title: t("Welcome to AdaTwin"),
      body: t(
        "Here is a quick look around this page. Each page shows you around the first time you open it; press ? in the top bar to see it again.",
      ),
    },
    {
      target: "steps",
      title: t("Every page is a step"),
      body: t(
        "The step you are on. Open it to jump back to any step, or on to one you have already reached.",
      ),
    },
    {
      target: "save",
      title: t("Saved as you go"),
      body: t(
        "There is no save button. Every change reaches the server on its own, and this shows when it has.",
      ),
    },
    {
      target: "models",
      title: t("Pick the models"),
      body: t(
        "Choose which Gemini model thinks and which one draws. You can change them later from the top bar.",
      ),
    },
    {
      target: "sample-banner",
      title: t("This is a sample plant"),
      body: t(
        "A read-only plant to try every step with. Delete it whenever you are ready to start your own.",
      ),
    },
    {
      target: "panoramas",
      title: t("Add your panoramas"),
      body: t(
        "Drop, paste or pick 360° photos, one per room or hall, in a 2:1 ratio. Name each one after the room it shows.",
      ),
    },
    {
      target: "process",
      title: t("Describe the flow"),
      body: t(
        "In a sentence or two, say how material moves through the floor. It makes the material flow we draft much better.",
      ),
    },
    {
      target: "capture-actions",
      title: t("Build the world, then move on"),
      body: t(
        "Generate a walkable 3D world from your first panorama; it takes about 5 minutes and the demo world stands in meanwhile. Continue to the twin whenever you like.",
      ),
    },
    {
      target: "samples",
      title: t("Or start from a sample"),
      body: t(
        "No panoramas to hand? Open a sample world and walk through every step with it.",
      ),
    },
  ],
  twin: [
    {
      title: t("Build the twin"),
      body: t(
        "List the machines on your floor, place them in the 3D world, and draw how material moves between them.",
      ),
    },
    {
      target: "twin-view",
      title: t("Two views of one plant"),
      body: t(
        "The 3D world is where machines are pinned. The material flow is the diagram the simulation runs on.",
      ),
    },
    {
      target: "machines",
      title: t("List your machines"),
      body: t(
        "Open this panel to add each machine and how many there are, then look up its parameters.",
      ),
    },
    {
      target: "locate",
      title: t("Find them in the photo"),
      body: t(
        "Gemini looks for every listed machine and pins it in the world. Pin any it misses by hand, and click a pin to move it.",
      ),
    },
    {
      target: "flow-draft",
      title: t("Draft the flow"),
      body: t(
        "We draft the links between machines from your description. Drag nodes to tidy them, or ask for changes in the chat below.",
      ),
    },
    {
      target: "twin-help",
      title: t("Moving around"),
      body: t(
        "W and S move the camera, drag to look around, and the wheel zooms. The full list is here.",
      ),
    },
    {
      target: "confirm",
      title: t("Confirm the twin"),
      body: t(
        "Once every machine is placed and the flow holds together, confirm it to set up a scenario.",
      ),
    },
  ],
  scenario: [
    {
      title: t("Set the test"),
      body: t(
        "Choose the conditions the plant has to cope with and the results it must reach. Nothing runs yet.",
      ),
    },
    {
      target: "scenario-chat",
      title: t("Describe it in words"),
      body: t(
        "Say what the shift looks like, like “a 32 °C day with a rush order of 260”, and accept the settings it suggests.",
      ),
    },
    {
      target: "conditions",
      title: t("Conditions"),
      body: t(
        "What is outside your control: demand, shift length, heat, supply. Change any figure by hand.",
      ),
    },
    {
      target: "requirements",
      title: t("Requirements"),
      body: t(
        "What a good shift must reach. Leave one empty if it does not matter.",
      ),
    },
    {
      target: "briefing",
      title: t("Brief the crew"),
      body: t(
        "Tell your agents what matters beyond the numbers. It changes how they decide, not the plant.",
      ),
    },
    {
      target: "effects",
      title: t("See what changes"),
      body: t(
        "Every condition, turned into its effect on each machine, before anything runs. Your twin itself is untouched.",
      ),
    },
    {
      target: "scenario-next",
      title: t("Pick your crew next"),
      body: t("When the test looks right, choose who runs the shift."),
    },
  ],
  agents: [
    {
      title: t("Put a crew on the floor"),
      body: t(
        "AI agents make the decisions people would make during the shift. Roles you leave empty follow standard rules.",
      ),
    },
    {
      target: "agents",
      title: t("Your agents"),
      body: t(
        "Each agent holds one role. Its personality decides how it trades output against risk.",
      ),
    },
    {
      target: "agent-add",
      title: t("Add another"),
      body: t("Add agents up to the limit. Two agents can share a role."),
    },
    {
      target: "tick",
      title: t("How often they check in"),
      body: t(
        "Every check-in is one question to Gemini per agent, so shorter intervals make the run slower.",
      ),
    },
    {
      target: "agents-next",
      title: t("Run the shift"),
      body: t("Start the simulation and watch the crew work your plant."),
    },
  ],
  results: [
    {
      title: "Run, read, redesign",
      body: t(
        "Run the shift on your twin, see where time goes, then try changes and keep the ones that help.",
      ),
    },
    {
      target: "run",
      title: t("Run the shift"),
      body: t(
        "Runs the scenario over several simulated days. Run it again after anything changes.",
      ),
    },
    {
      target: "playback",
      title: t("Play it back"),
      body: t(
        "Scrub through the shift to see what each machine was doing and what each agent decided.",
      ),
    },
    {
      target: "plant-view",
      title: t("Your plant or the redesign"),
      body: t(
        "Switch between the plant as it is and the plant with your picked changes.",
      ),
    },
    {
      target: "results-tabs",
      title: t("Results and changes"),
      body: t(
        "Results shows how the shift went and what to fix. Changes lists what you have picked, with costs and versions.",
      ),
    },
    {
      target: "design-chat",
      title: t("Redesign by asking"),
      body: t(
        "Ask for a change in your own words. Run with the changes, then apply the ones that help to your twin.",
      ),
    },
  ],
  plant: [
    {
      title: t("Your new plant"),
      body: t(
        "The changes you applied, ranked most critical first, and drawn into photos of your plant.",
      ),
    },
    {
      target: "report",
      title: t("Before and after"),
      body: t(
        "What the plant makes with and without the redesign, and which targets it now meets. Below, each change is measured on its own and ranked, so you know which to make first.",
      ),
    },
    {
      target: "photos",
      title: t("See it in your photos"),
      body: t(
        "Nano Banana draws each change into your plant. Ask for edits, pick the drawing you like, and it goes into the report.",
      ),
    },
    {
      target: "plant-actions",
      title: t("Take it with you"),
      body: t("Print the report, or go back to Results to try more changes."),
    },
  ],
};
