# 22. A mystery with server-owned truth

“Night of the Missing Villager” adds an investigation before the first council.
Enable it in setup with one human and six AI seats, using standard roles. The
human is dealt Villager; other roles are shuffled. The bellkeeper is an off-table
character, so the opening does not silently kill a configured player.

## Facts, testimony, and agent memory

The server chooses one dealt werewolf as the abductor, an innocent scarf owner,
and an innocent witness. These identities and the investigation progress live
in `GameState.missing_villager`, under the existing PostgreSQL graph checkpointer.
Clues describe a cut scarf and a broken-heel trail. Neither clue changes when an
agent accuses someone. The initial interviews are **authored witness accounts**,
not model-generated dialogue; the configured models deliberate in the subsequent
council and vote as usual.

[missing_villager.py:17-61](../../backend/app/game/missing_villager.py#L17-L61)

`investigation_view` sends only discovered clues, already-spoken accounts, and
currently legal actions to the investigator. It never serializes the culprit
field. `case_memory` is called from the existing `build_agent_view` boundary:
the abductor knows their own crime, the framed seat knows their own alibi, and
the witness knows what they saw. A seat receives only its own interview record.
The ordinary briefing feeds this scoped context into the seat's persistent mind.
Other agents learn only the physical evidence the investigator publicly presents.
The human can recount the private testimony in their normal speaking turn.

[missing_villager.py:64-91](../../backend/app/game/missing_villager.py#L64-L91)

Private investigation log entries use the existing seat-bound log/SSE filter;
only the investigator and authorized host can read them. God Mode is off on
initial entry, although hosts can deliberately enable it. A host credential still
has the pre-existing authority to inspect roles; this is not an anti-cheating mode.

## One action, one checkpoint

The graph branches after role assignment into `open_case → investigate`.
Each execution of `investigate` contains one human interrupt, validates an action
and revision, applies one change, then yields to its self-edge. Both clues and at
least one question for each of the three witnesses are required before presenting.
The player can ask a second question of each witness and choose to present one
clue or both. Completing the investigation enters normal Day 1 discussion and
voting; the ordinary opening night is replaced by this authored disappearance.

[missing_villager.py:94-151](../../backend/app/game/missing_villager.py#L94-L151)

The input endpoint rejects unavailable choices and stale revision IDs before
resuming the graph. Existing seat authorization still applies. Pausing happens
after the human interrupt, so resuming cannot consume the answer as a pause or
duplicate a discovered clue. Branching clones the case and progress along with
the checkpoint, enters through `open_case`'s successor, and validates the
replacement against that checkpoint's options. It does not deal a new culprit.

These saves support active-game reconnects and checkpoint branching. As with
other modes, the current app does not automatically restore its in-memory active
registry after an API process restart.

## A rule-based consequence

After the actual first council vote, casting out the abductor rescues the
bellkeeper. Casting out anyone else leaves him missing. This uses the council's
resolved tally, not just the human's vote. On success, the bellkeeper's warning
blocks an attack on the investigator during Night 2 only; it does not protect
other seats or persist into later rounds. Doctor protection and the normal
werewolf hunt otherwise continue unchanged. Consequences are public log events
and therefore remain visible in ordinary replay exports.

[missing_villager.py:154-169](../../backend/app/game/missing_villager.py#L154-L169)
[nodes.py:501-510](../../backend/app/game/nodes.py#L501-L510)

## Pitfall caught in implementation

LangGraph injects node configuration by its `RunnableConfig` annotation. Typing
it as a plain `dict` left the new node without its configuration and prevented
the first investigation interrupt. The episode tests subscribe to error events
as well as inspecting state, so an error caught by the orchestrator cannot look
like a successful run. All three episode nodes now use `RunnableConfig`.

The integration tests exercise the full compiled graph, scoped knowledge,
stale and out-of-order input, pause replay, a counterfactual evidence choice,
and both next-night outcomes against PostgreSQL.

## Smooth investigation and visible learning concepts

The episode now stays mounted while an accepted input waits for the next
LangGraph interrupt. Previously both `Controls` and the episode were keyed by
`turn_id`: each choice unmounted the whole casebook, briefly replaced it with a
waiting line, then rebuilt it. That collapsed the page and moved the reading
position. The investigation now uses a stable component key, retains its last
view during the handoff, and disables that view until the server supplies a new
turn. The submission lock is scoped to the turn ID, so duplicate clicks cannot
resubmit an accepted action. Ordinary council controls retain their per-turn keys.

See [GameView.tsx](../../frontend/components/GameView.tsx),
[Controls.tsx](../../frontend/components/Controls.tsx), and
[MissingVillagerInvestigation.tsx](../../frontend/components/MissingVillagerInvestigation.tsx).

The casebook has a bounded scrolling region and new evidence fades in (disabled
for reduced motion). Each chapter connects the interaction to a learning concept:
human interrupt/resume, observation versus inference, and partial observability.
The final prompt asks the learner to predict the effect of withholding evidence.
These are teaching prompts, not a claim that the scripted witnesses are LLM agents.
