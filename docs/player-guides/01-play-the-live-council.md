# Play the Live Council

This guide covers the features encountered while a game is running: private
werewolf negotiation, beliefs, notes, multiple human seats, voice, and dynamic
events.

## FE-01 — Real werewolf negotiation

### What happens

When both werewolves are alive, night begins with a private council. Each wolf
gets an opening proposal and one revision opportunity. The message may justify
a target, respond to the teammate, and suggest a deception strategy for the
following day.

If both proposals agree, that target becomes the attack. If they still disagree
after the bounded exchange, a deterministic seating-order rule resolves the
target so the graph cannot stall indefinitely.

### How to play it

If you are a human werewolf:

1. Wait for the private council prompt.
2. Select a living non-werewolf target.
3. Write a concise message to your teammate.
4. On the revision turn, keep your target or change it after reading the other
   wolf's proposal.
5. Choose **Pass this council turn** whenever you have nothing useful to add.
   Passing preserves your most recent proposal, if one exists; an opening pass
   proposes no target.
6. During the day, remember that the council itself is secret. You may use the
   plan, but revealing private knowledge can expose you.

If you are not a werewolf, you do not see this exchange. Infer coordination
only from later public speech, votes, and attacks.

### How to observe it

- A living human werewolf sees the private exchange as permitted role context.
- The host can see the exchange in God Mode.
- The Learning Debrief reconstructs the proposals and final resolution.
- Ordinary villagers never receive the private messages through their stream or
  agent context.

### How to interpret it

Look for three separate things:

- **Coordination:** Did both wolves converge on the same target?
- **Adaptation:** Did either wolf revise after hearing new reasoning?
- **Follow-through:** Did their daytime statements support the private plan?

Agreement does not necessarily prove high-quality reasoning; both wolves may
agree on a poor target. Disagreement does not necessarily indicate failure;
it exposes different threat models, which is valuable multi-agent evidence.

### Useful experiment

Give one wolf a cautious persona and the other an aggressive persona. Predict
which one will change its target, then inspect the private exchange and the
final server resolution.

## FE-02 — Trust and suspicion

### What the scores mean

Every agent maintains a private observer-to-subject belief:

- **Suspicion:** 0 means little perceived threat; 100 means extreme perceived
  threat.
- **Trust:** displayed as the inverse of suspicion for readability.
- **Confidence:** how strongly the observer stands behind its current score.
- **Reason:** the agent's concise evidence-linked explanation for the change.

These values belong to one observer. Mara's suspicion of Tomas is independent
of Tomas's suspicion of Mara and is never automatically shared.

### How to use it

Players do not edit agent scores. Continue speaking and voting normally. In God
Mode, open the trust/suspicion matrix to inspect how public claims, votes,
deaths, role reveals, and private discoveries changed each model's view.

In the Learning Debrief, replay revisions in sequence rather than looking only
at the final matrix.

### How to read the matrix

- Read across a row to see one observer's model of the village.
- Read down a column to see how differently observers judge the same subject.
- Compare score and confidence. High suspicion with low confidence is a working
  hypothesis; high suspicion with high confidence is a committed theory.
- Follow the cited event before accepting the reason.

### What not to conclude

- Suspicion is **not** a calibrated probability that someone is a werewolf.
- Trust is not independently measured; it is the inverse presentation of the
  suspicion score.
- A confident score can be wrong.
- Similar scores across agents do not prove collusion; they may have interpreted
  the same public evidence similarly.

### Useful experiment

Find one public statement that all living agents heard. Compare their next
belief revisions. The divergence demonstrates that shared input does not create
shared interpretation.

## FE-07 — Agent-authored private notes

### What agents can record

Agents may create structured private notes in five categories:

- `suspicion` — a threat hypothesis about a player;
- `clue` — an observation worth retaining;
- `theory` — an explanation connecting several events;
- `lie` — a deception the agent plans or believes it observed;
- `alliance` — a cooperation or trust hypothesis.

An agent can revise an active note or retire it when disproved. History is
append-only: revision does not erase the earlier belief.

### How to observe notes

God Mode shows the seat-isolated notebook and its revisions. The post-game
Learning Debrief preserves the same evolution. An ordinary agent sees only its
own notebook through identity-bound tools.

### How to interpret notes

Treat a note as **externalized working memory**, not as ground truth or hidden
chain-of-thought. Ask:

1. What visible source event did the agent cite?
2. Did the note survive later contradictory evidence?
3. Was it revised, retired, or simply ignored?
4. Did a later statement, vote, or tool action align with it?

A note that changes after evidence indicates adaptation. A note that never
changes can indicate consistency, anchoring, or simply a lack of tool use; the
surrounding evidence decides which interpretation is reasonable.

### Privacy boundary

A note may cite a public event or the author's own private event. It cannot cite
another seat's hidden evidence. Rejected citations are evidence that the rule
layer protected the information boundary.

## FE-09 — Multiple human players

### Set up a room

1. On setup, mark two or more seats as human.
2. Choose the host's own human seat.
3. Complete model readiness checks for the remaining AI seats.
4. The room lobby creates a different private join link for every human seat.
5. Send each participant only their own link.
6. The host enters through **Enter as host** and starts the game when ready.

### Identity on the board

Each browser is bound to one seat:

- the current browser's seat is marked **YOU**;
- another person-controlled seat is marked **HUMAN**;
- AI seats show their configured persona;
- private role and prompt data are filtered for the credential-bound viewer.

The host credential grants room controls and God Mode, but a human action still
uses the host's seat credential and passes through the same validation as every
other player.

### Reconnection and recovery

Opening the same valid join link restores that seat and any pending prompt. If
an invited player cannot join, the host can rotate the link or replace the seat
with the safe offline AI. The host may also pause or stop the room.

### How to interpret a waiting game

If the graph waits when another person's turn arrives, that is intentional
human-in-the-loop suspension—not an agent failure. The next graph node cannot
advance until the correct credential submits the permitted action.

### Security practice

- Treat join links like temporary passwords.
- Rotate a link if it was sent to the wrong person.
- Do not put access or host tokens in screenshots or public posts.
- Use a public replay link, not a live game link, when sharing afterward.

## FE-10 — Voice Council

### Enable and choose an engine

Voice playback is disabled until each viewer chooses **Enable & test voices**.
That click immediately plays a short local test inside the browser's required
user gesture, so blocked autoplay does not make the control appear silently
broken. After enabling it:

- **Local · device** is the dependable default. It ranks installed voices,
  avoids known novelty/robotic voices, and makes no speech API request.
- **Lifelike · neural** requests a natural, ancient-village performance from
  the configured OpenAI speech model.
- **Ceremonial**, **Measured**, and **Urgent** adjust delivery pace.
- **Mute**, **Skip**, **Replay**, and **Test voice** affect only local playback.

Neural audio is explicitly AI-generated. The backend resolves the requested
event sequence to a persisted public statement, so private thoughts and
arbitrary browser text cannot be sent for narration.

### Cost and fallback

Neural speech consumes API credits. Each immutable public line is cached by
game, event, model, and voice, so reconnects and multiple viewers do not
regenerate it. If neural speech is not configured or fails, the client switches
to a ranked natural device voice. The viewer can re-select Neural to retry.

### How to interpret voice

Voice, pacing, and the speaking-character animation are presentation. They do
not reveal emotion detected inside the model and do not alter the action. The
persisted visible caption is always authoritative.

Do not infer confidence, honesty, or role from the generated performance alone.
Use public wording, validated actions, and later evidence.

## FE-11 — Dynamic village events

Enable **Village events** under World rules. At most one deterministic event
changes a round's action or information space:

### Silence

One player loses that round's discussion turn. Silence is not refusal, timeout,
or evidence of guilt. Interpret the missing statement as a rule effect.

### Secret ballot

Individual votes remain hidden until the sealed tally resolves. Do not expect
the live feed to reveal each choice immediately. The final validated tally is
the authoritative record.

### Forced testimony

The server changes who must speak first. This can alter downstream discussion
because later agents receive a different order of public evidence.

### Discovered evidence

The village receives an ambiguous public clue. Every agent sees the same clue,
but the clue is not guaranteed to identify a role. Compare interpretations
rather than treating it as ground truth.

### Why replay remains meaningful

Event selection is deterministic under checkpoint replay. A branch restored
before the changed decision begins from the same event conditions, making the
human or agent choice—not a newly rolled event—the primary comparison.

### Useful experiment

Enable events and predict which persona is most sensitive to ambiguous public
evidence. Compare its notes and suspicion revisions before and after the clue.
