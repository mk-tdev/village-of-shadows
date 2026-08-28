# Gameplay Recording Overlay Script

Use this as short on-screen text while recording the Village of Shadows gameplay flow. The intended sequence is: home page, setup/player configuration, game window, God Mode, human turn, voting, post-game debrief, and closing shot.

## Home Page

```text
Village of Shadows

A Werewolf-style game where AI agents are not just responding.

They are playing.
```

```text
Six AI agents.
One human player.
Secret roles.
Private memory.
Competing objectives.
```

```text
This is an agentic AI learning environment built with LangGraph.

Not a chatbot.
Not a fixed research workflow.
A live multi-agent system.
```

## Setup / Player Configuration

```text
Each seat can have its own model, personality, and memory.
```

```text
For this demo, I am allowing Mock agents and OpenAI agents.

Other providers are visible, but locked to keep the public demo stable.
```

```text
Before the game starts, each selected model must pass a readiness check.

If a model name or API key is wrong, the game stops here instead of breaking later.
```

```text
The human is not supervising the workflow.

The human is one of the players.
```

```text
LangGraph controls the rules of the world.

It does not decide whom the agents trust, accuse, protect, investigate, or eliminate.
```

## Game Window / Start Game

```text
The graph begins.

Roles are assigned.
Private knowledge is created.
Each agent sees only what its character is allowed to know.
```

```text
Night phase.

Werewolves may coordinate.
The seer may investigate.
The doctor may protect.

Every action goes through validated tools.
```

```text
Discussion phase.

Agents accuse, defend, mislead, remember, and revise their beliefs.
```

```text
The same conversation creates different interpretations.

One model sees a clue.
Another suspects an innocent player.
A werewolf may redirect the village.
```

## God Mode / Observability

```text
God Mode reveals the system underneath the game.

Agent role.
Private context.
Prompt briefing.
Memory depth.
Tool calls.
Decisions.
```

```text
Here I can inspect what each agent knew at a specific moment.

Not hidden chain-of-thought,
but the effective briefing, private state, and observable reasoning signals.
```

```text
Live activity shows the agents acting in real time.

LangGraph moves the world forward.
MCP tools validate what each player is allowed to do.
```

## Human Turn

```text
When it is my turn, the graph pauses.

Execution resumes only after I speak, vote, or act.
```

```text
Human input and AI actions pass through the same rule layer.

I am inside the system, not outside it.
```

## Voting / Resolution

```text
Now the village votes.

Confidence does not mean truth.
Suspicion does not mean evidence.
```

```text
Sometimes the agents vote out a werewolf.

Sometimes they confidently eliminate an innocent player.
```

## Post-Game Debrief

```text
After the game, the learning debrief connects the gameplay back to agentic AI concepts.
```

```text
Where did human-in-the-loop suspension happen?

How did partial observability affect decisions?

Which tools were called?

How did memory evolve?
```

```text
This turns the game into a closed-loop learning experience.

Configure.
Predict.
Play.
Observe.
Debrief.
Replay.
```

## Closing

```text
Agentic AI does not have to look like a chatbot.

Sometimes the best way to understand agents
is to give them identities, incomplete information,
competing objectives,
and then sit down at the table with them.
```

```text
Village of Shadows

Built with LangGraph, MCP, OpenAI, and Codex.
```
