# AdaTwin

A digital twin of a real factory floor: its machines and the way material moves between them, simulated shift by shift with AI agents running the floor, so a plant manager can test changes before making them for real.

## The plant and its twin

**Plant**:
The real factory floor the user captures and wants to improve.
_Avoid_: factory (in prose about the user's own floor), site

**Twin**:
The plant as modelled: its machines with their figures, and the flow of material between them.
_Avoid_: model, digital model, graph (outside the simulation)

**Machine**:
One kind of equipment on the floor that work passes through, with how many units of it there are.
_Avoid_: station (outside the simulation), asset

**Auxiliary machine**:
Equipment work never passes through but machines stop without, such as a gas valve train feeding the boilers.
_Avoid_: support equipment, utility

**Flow**:
The route material takes through the machines, including where it waits between them.
_Avoid_: process graph, routing

**Scenario**:
The conditions a shift is run under, such as heat, demand, supply losses and staff off sick, together with its targets and the briefing given to the crew.
_Avoid_: conditions, settings, case

**Unit of work**:
What the plant makes and counts, named by the plant: batches, parts, castings, motors.
_Avoid_: item, product (when counting output)

## Shifts and runs

**Shift**:
One stretch of the plant working under a scenario, of the scenario's length.
_Avoid_: simulation, session

**Crew**:
The AI agents who run the floor during a shift, each with a role (planner, technician, supervisor) and a personality.
_Avoid_: agents (as a collective), bots, team

**Standard rules**:
The fixed way of running the floor that needs no agents: the yardstick the crew is compared against.
_Avoid_: default policy, baseline rules, heuristics

**Days**:
The same shift repeated on consecutive seeds under standard rules, so one lucky or unlucky day cannot pass for the plant's real performance.
_Avoid_: replications, samples, iterations

**Run**:
One shift worked by the crew, together with its days under standard rules, as kept for the project.
_Avoid_: simulation, job, execution

**Latest run**:
The project's most recent run on its own twin, which the results step shows and the redesign is measured against.
_Avoid_: current run, baseline run

**Playbook**:
The crew's way of working from a run, written down as fixed rules so it can be replayed over many days.
_Avoid_: policy, strategy

## Redesign

**Change**:
One proposed improvement to the twin, such as one more unit on a machine, a bigger buffer, faster repairs or an extra maintenance crew.
_Avoid_: recommendation, fix, modification

**Origin**:
Where a change came from: suggested from the run's numbers, asked for in the design chat, or found by the AI looking for equipment the plant lacks.
_Avoid_: source, type

**Picks**:
The changes the user has chosen to try together.
_Avoid_: kept changes, accepted changes, selection

**Redesign**:
The twin as the picks would leave it.
_Avoid_: new design, proposal

**Baseline**:
The twin as it is, without the picks: what every gain is measured against.
_Avoid_: before, current plant, original (and never for the first day of a run)

**Measure**:
To re-run the latest run's days with some changes made, under standard rules, for a quick comparison.
_Avoid_: estimate, evaluate, simulate (for this quick check)

**Gain**:
How many more units of work a shift ships with some changes than the baseline, paired day by day.
_Avoid_: improvement, uplift, delta

**Trial**:
A full run with the crew on a copy of the twin with the picks made, shown to the user as "run with changes". The twin itself is untouched.
_Avoid_: test run, preview run

**Apply**:
To make the picks part of the twin for good, ending the redesign.
_Avoid_: accept, commit, save

## Where a redesign stands

**Stale**:
The latest run was made on a twin or scenario that no longer matches the project's.
_Avoid_: out of date (for runs), invalid

**Outdated**:
A trial exists, but for picks other than the current ones.
_Avoid_: stale (for trials)

**Tested**:
The picks have a trial made for exactly them, on a latest run that is not stale. Only tested picks can be applied.
_Avoid_: verified, validated, approved
