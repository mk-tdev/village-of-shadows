# Village of Shadows: a playable classroom for AI decisions

Students make a prediction, observe AI behavior, inspect the evidence, and test an alternative. The horror prologue introduces the world; the council is the learning activity. These activities are teaching plans using existing game tools, not claims of measured learning outcomes.

| Activity | Student task | Learning objective | Evidence to collect |
| --- | --- | --- | --- |
| Compare models | Configure different models, predict behavior, then observe several comparable games. | Form hypotheses and recognize experimental confounds. | Predictions, model/persona/role settings, examples that support or contradict the hypothesis. |
| Pause before a vote | Name a suspect and cite two specific statements. Reconsider after another exchange. | Distinguish evidence from confidence, persuasion, and confirmation bias. | Before/after suspicion and an explanation of what changed it. |
| Inspect agent memory and tools | Explain a decision, then inspect authorized memory and recorded tool calls. | Understand context, memory, tools, and partial observability. | Trace from available evidence to tool action; distinguish recorded explanations from inaccessible internal reasoning. |
| Branch a replay | Replace one decision at a checkpoint and compare both timelines. | Reason about consequences and counterfactuals. | What was changed, what was preserved, and where outcomes diverged. Stochastic model outputs mean one comparison does not prove causality. |
| Trace a turn through the graph | Follow a player turn from input to node, tool validation, persistence, and browser event. | Understand state machines, human interrupts, and multi-agent engineering. | A short annotated trace linked to the concept guide and source code. |

## Five-minute finals demonstration

1. 0:00–0:30 — Walk to the council. Sitting ends the intro and opens player/model setup.
2. 0:30–1:15 — Configure the roster and state a hypothesis about an agent revising its suspicion.
3. 1:15–2:45 — Show an exchange. Ask the audience who they suspect and what evidence supports it.
4. 2:45–3:45 — Scroll to technical tools while the mini council and chat remain visible. Inspect recorded memory and actions.
5. 3:45–4:45 — Show a prepared replay branch with one changed decision.
6. 4:45–5:00 — Explain what building and observing the system taught you.

Prepare a saved demonstration alongside live play. Do not rely on a particular model output or winning the game. Score the quality of evidence, recognition of uncertainty, and revision of reasoning—not guessing the werewolf correctly.

## Proposed next teaching feature

Teacher-led lesson mode: learning objective, written prediction, pause points, and a reflection comparing prediction with evidence. This is a future proposal, not an implemented lesson system.

English and Simplified Chinese council sessions can support bilingual discussion. Keep the same game language within a session for a fair model comparison. Names, provider identifiers, and technical APIs stay unchanged.
