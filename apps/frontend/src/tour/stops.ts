import type { StepSlug } from "@/lib/projects";

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
      title: "Welcome to AdaTwin",
      body: "Here is a quick look around this page. Each page shows you around the first time you open it; press ? in the top bar to see it again.",
    },
    {
      target: "steps",
      title: "Every page is a step",
      body: "The step you are on. Open it to jump back to any step, or on to one you have already reached.",
    },
    {
      target: "save",
      title: "Saved as you go",
      body: "There is no save button. Every change reaches the server on its own, and this shows when it has.",
    },
    {
      target: "models",
      title: "Pick the models",
      body: "Choose which Gemini model thinks and which one draws. You can change them later from the top bar.",
    },
    {
      target: "sample-banner",
      title: "This is a sample plant",
      body: "A read-only plant to try every step with. Delete it whenever you are ready to start your own.",
    },
    {
      target: "panoramas",
      title: "Add your panoramas",
      body: "Drop, paste or pick 360° photos, one per room or hall, in a 2:1 ratio. Name each one after the room it shows.",
    },
    {
      target: "process",
      title: "Describe the flow",
      body: "In a sentence or two, say how material moves through the floor. It makes the material flow we draft much better.",
    },
    {
      target: "capture-actions",
      title: "Build the world, then move on",
      body: "Generate a walkable 3D world from your first panorama; it takes about 5 minutes and the demo world stands in meanwhile. Continue to the twin whenever you like.",
    },
    {
      target: "samples",
      title: "Or start from a sample",
      body: "No panoramas to hand? Open a sample world and walk through every step with it.",
    },
  ],
  twin: [
    {
      title: "Build the twin",
      body: "List the machines on your floor, place them in the 3D world, and draw how material moves between them.",
    },
    {
      target: "twin-view",
      title: "Two views of one plant",
      body: "The 3D world is where machines are pinned. The material flow is the diagram the simulation runs on.",
    },
    {
      target: "machines",
      title: "List your machines",
      body: "Open this panel to add each machine and how many there are, then look up its parameters.",
    },
    {
      target: "locate",
      title: "Find them in the photo",
      body: "Gemini looks for every listed machine and pins it in the world. Pin any it misses by hand, and click a pin to move it.",
    },
    {
      target: "flow-draft",
      title: "Draft the flow",
      body: "We draft the links between machines from your description. Drag nodes to tidy them, or ask for changes in the chat below.",
    },
    {
      target: "twin-help",
      title: "Moving around",
      body: "W and S move the camera, drag to look around, and the wheel zooms. The full list is here.",
    },
    {
      target: "confirm",
      title: "Confirm the twin",
      body: "Once every machine is placed and the flow holds together, confirm it to set up a scenario.",
    },
  ],
  scenario: [
    {
      title: "Set the test",
      body: "Choose the conditions the plant has to cope with and the results it must reach. Nothing runs yet.",
    },
    {
      target: "scenario-chat",
      title: "Describe it in words",
      body: "Say what the shift looks like, like “a 32 °C day with a rush order of 260”, and accept the settings it suggests.",
    },
    {
      target: "conditions",
      title: "Conditions",
      body: "What is outside your control: demand, shift length, heat, supply. Change any figure by hand.",
    },
    {
      target: "requirements",
      title: "Requirements",
      body: "What a good shift must reach. Leave one empty if it does not matter.",
    },
    {
      target: "briefing",
      title: "Brief the crew",
      body: "Tell your agents what matters beyond the numbers. It changes how they decide, not the plant.",
    },
    {
      target: "effects",
      title: "See what changes",
      body: "Every condition, turned into its effect on each machine, before anything runs. Your twin itself is untouched.",
    },
    {
      target: "scenario-next",
      title: "Pick your crew next",
      body: "When the test looks right, choose who runs the shift.",
    },
  ],
  agents: [
    {
      title: "Put a crew on the floor",
      body: "AI agents make the decisions people would make during the shift. Roles you leave empty follow standard rules.",
    },
    {
      target: "agents",
      title: "Your agents",
      body: "Each agent holds one role. Its personality decides how it trades output against risk.",
    },
    {
      target: "agent-add",
      title: "Add another",
      body: "Add agents up to the limit. Two agents can share a role.",
    },
    {
      target: "tick",
      title: "How often they check in",
      body: "Every check-in is one question to Gemini per agent, so shorter intervals make the run slower.",
    },
    {
      target: "agents-next",
      title: "Run the shift",
      body: "Start the simulation and watch the crew work your plant.",
    },
  ],
  results: [
    {
      title: "Run, read, redesign",
      body: "Run the shift on your twin, see where time goes, then try changes and keep the ones that help.",
    },
    {
      target: "run",
      title: "Run the shift",
      body: "Runs the scenario over several simulated days. Run it again after anything changes.",
    },
    {
      target: "playback",
      title: "Play it back",
      body: "Scrub through the shift to see what each machine was doing and what each agent decided.",
    },
    {
      target: "plant-view",
      title: "Your plant or the redesign",
      body: "Switch between the plant as it is and the plant with your picked changes.",
    },
    {
      target: "results-tabs",
      title: "Results and changes",
      body: "Results shows how the shift went and what to fix. Changes lists what you have picked, with costs and versions.",
    },
    {
      target: "design-chat",
      title: "Redesign by asking",
      body: "Ask for a change in your own words. Run with the changes, then apply the ones that help to your twin.",
    },
  ],
  plant: [
    {
      title: "Your new plant",
      body: "The changes you applied, ranked most critical first, and drawn into photos of your plant.",
    },
    {
      target: "report",
      title: "Before and after",
      body: "What the plant makes with and without the redesign, and which targets it now meets. Below, each change is measured on its own and ranked, so you know which to make first.",
    },
    {
      target: "photos",
      title: "See it in your photos",
      body: "Nano Banana draws each change into your plant. Ask for edits, pick the drawing you like, and it goes into the report.",
    },
    {
      target: "plant-actions",
      title: "Take it with you",
      body: "Print the report, or go back to Results to try more changes.",
    },
  ],
};
