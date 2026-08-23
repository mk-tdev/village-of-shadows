import Link from "next/link";
import { DoctorIcon, EyeIcon, VillagerIcon, WolfIcon } from "@/components/icons";
import { PROVIDER_MODEL_SUGGESTIONS } from "@/lib/seatDefaults";
import type { Provider } from "@/lib/types";

const ROLES = [
  {
    role: "werewolf",
    Icon: WolfIcon,
    count: "2 seats",
    body:
      "Each night, enter a private council with your fellow werewolf. Both wolves make an opening " +
      "proposal and may revise it after hearing the other. Agreement becomes the attack; if the bounded " +
      "council ends in disagreement, the earliest living wolf acts as pack leader. During the day, blend " +
      "in — never reveal that you or your teammate are werewolves.",
  },
  {
    role: "seer",
    Icon: EyeIcon,
    count: "1 seat",
    body:
      "Each night, secretly investigate one other player and instantly learn their true role. " +
      "Use what you learn to steer the day's discussion and vote without giving away how you know.",
  },
  {
    role: "doctor",
    Icon: DoctorIcon,
    count: "1 seat",
    body:
      "Each night, secretly protect one player — including yourself — from that night's attack. " +
      "If the werewolves' target matches who you protected, nobody dies that night.",
  },
  {
    role: "villager",
    Icon: VillagerIcon,
    count: "3 seats",
    body:
      "No night action. Your only power is the day vote — listen to the discussion, watch for " +
      "inconsistencies, and vote to eliminate whoever you think is a werewolf.",
  },
];

const HOSTED_MODEL_PROVIDERS: { provider: Provider; label: string; apiKey: string }[] = [
  { provider: "gemini", label: "Gemini", apiKey: "GOOGLE_API_KEY" },
  { provider: "openai", label: "OpenAI", apiKey: "OPENAI_API_KEY" },
  { provider: "claude", label: "Claude", apiKey: "ANTHROPIC_API_KEY" },
  { provider: "ollama_cloud", label: "Ollama Cloud", apiKey: "OLLAMA_API_KEY" },
];

export default function HowToPlayPage() {
  return (
    <div className="app">
      <header style={{ marginBottom: 22 }}>
        <h1 className="village-title">How to Play</h1>
        <div className="subtitle">
          Enter the council, configure its minds, and learn from every decision the world produces.
        </div>
      </header>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">What this is</h2>
        <p className="howto-p">
          Village of Shadows is Werewolf (a.k.a. Mafia) played by seven seats, where every seat except one is
          an AI agent — each running its own model, its own persona, and its own isolated context, making its
          own decisions through real tool calls rather than a script. The one exception is you: pick a seat on
          the setup page and you play alongside the agents as a genuine player, not just a spectator.
        </p>
        <p className="howto-p">
          Below the game itself, once it’s running, an <strong>Agent Engineering Debug</strong> panel shows
          the live orchestration graph, per-agent token usage, and a running feed of every node transition,
          turn, and MCP tool call — so you can watch how the agents are actually reasoning and acting, not
          just what they end up saying.
        </p>
      </div>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">The standard roles</h2>
        <p className="howto-p">
          Roles are dealt at random the moment you click <strong>Start Game</strong> — nobody, including you,
          picks or knows their role in advance. A 7-seat game always deals the same deck: 2 werewolves, 1 seer,
          1 doctor, and 3 villagers.
        </p>
        <div className="role-grid">
          {ROLES.map(({ role, Icon, count, body }) => (
            <div className="player-card role-card" key={role}>
              <div className={`avatar avatar-${role}`}>
                <Icon className="avatar-icon" />
              </div>
              <div className="p-info">
                <div className="p-name">
                  {role}
                  <span className="controller-badge ai">{count}</span>
                </div>
                <p className="howto-role-body">{body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">The expanded role pack</h2>
        <p className="howto-p">
          Enable <strong>Expanded roles</strong> under World rules to replace the three ordinary villagers
          with roles whose behavior is enforced by the server, not merely suggested in a prompt.
        </p>
        <ul className="howto-list">
          <li><strong>Hunter.</strong> When killed at night or by vote, chooses one living player to take down before the graph continues.</li>
          <li><strong>Mayor.</strong> Participates normally, but every validated village vote counts twice.</li>
          <li><strong>Jester.</strong> Has an independent objective and wins instantly if the village votes them out.</li>
        </ul>
      </div>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">How a round plays out</h2>
        <ol className="howto-list">
          <li>
            <strong>Night.</strong> The living werewolves first conduct a bounded private negotiation, with an
            opening proposal and one possible revision each. The graph deterministically resolves their final
            target, then the doctor protects and the seer investigates. Nobody else sees what happened until dawn.
          </li>
          <li>
            <strong>Resolution.</strong> If the werewolves’ target wasn’t protected by the doctor, that player
            dies and their role is revealed to everyone.
          </li>
          <li>
            <strong>Day discussion.</strong> Every living player speaks once, in turn order — accuse, defend,
            share a suspicion. Everything said here is public.
          </li>
          <li>
            <strong>Vote.</strong> Every living player votes for one other player to eliminate. Whoever gets
            the most votes is cast out and their role is revealed.
          </li>
          <li>
            <strong>Win check, after every death.</strong> Villagers win the instant every werewolf is dead.
            Werewolves win the instant they equal or outnumber everyone left alive. Otherwise, night falls
            again and the round repeats. In the expanded pack, the Jester wins immediately when voted out.
          </li>
        </ol>
      </div>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">Configuring a game</h2>
        <ul className="howto-list">
          <li>
            <strong>Who is human?</strong> Pick your own host seat and optionally mark more seats as human.
            The setup creates private, revocable join links; each browser is cryptographically bound to one
            seat and receives only that character’s permitted state.
          </li>
          <li>
            <strong>Name</strong> is just what everyone calls that seat in the transcript and log.
          </li>
          <li>
            <strong>Personality</strong> is not cosmetic — it’s written directly into that agent’s system
            prompt every single turn (“You are {"{name}"}, a {"{personality}"} villager…”). A seat you set to
            “grumpy” or “sly” or “anxious” will actually behave differently, because the model is told to.
          </li>
          <li>
            <strong>Provider &amp; Model</strong> (AI seats only) — pick <code>mock</code> to play instantly
            offline with no API key (it makes scripted-but-legal moves so you can try the whole app for free),
            or a real provider (Claude, OpenAI, Gemini, Ollama) if you’ve configured that provider’s API key in
            the backend’s <code>.env</code> — for Ollama, make sure the local server is running and the model
            is already pulled.
          </li>
          <li>
            You can mix and match freely — a game can have several different real providers and models seated
            at once, alongside mock seats, all playing the same game together.
          </li>
          <li>
            Open <strong>Agent laboratory</strong> on any AI seat to tune risk, honesty, aggressiveness,
            reasoning depth, memory and tool strategy, token limits, timeout, retry, and fallback behavior.
            Presets can be saved, duplicated, exported, and re-used; the immutable base role and safety prompt remains in control.
          </li>
          <li>
            <strong>World rules</strong> enable expanded roles, deterministic village events, opt-in cross-game
            relationships, a room name, and a server-enforced total token ceiling.
          </li>
        </ul>
      </div>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">Optional village events</h2>
        <p className="howto-p">One server-selected event can alter each day without bypassing ordinary action validation:</p>
        <ul className="howto-list">
          <li><strong>Silence</strong> skips exactly one speaker for that discussion.</li>
          <li><strong>Secret ballot</strong> hides individual votes until the sealed tally opens.</li>
          <li><strong>Forced testimony</strong> changes who must speak first.</li>
          <li><strong>Discovered evidence</strong> adds an ambiguous public clue for every mind to interpret.</li>
        </ul>
        <p className="howto-p">Selection is deterministic under checkpoint replay, so a branch begins from the same world before your changed decision alters it.</p>
      </div>

      <div className="setup-card" style={{ marginBottom: 20 }}>
        <h2 className="howto-heading">Available hosted AI models</h2>
        <p className="howto-p">
          These are the reasoning and tool-calling models suggested by the setup screen. You can still type a
          different model ID in the editable model field. Before a game is created, every selected model receives
          a real readiness message and must successfully call the test tool.
        </p>
        <div className="model-catalog-grid">
          {HOSTED_MODEL_PROVIDERS.map(({ provider, label, apiKey }) => (
            <section className="model-catalog-card" key={provider}>
              <div className="model-catalog-heading">
                <h3>{label}</h3>
                <code>{apiKey}</code>
              </div>
              <ul className="model-catalog-list">
                {PROVIDER_MODEL_SUGGESTIONS[provider].map((model) => (
                  <li key={model.value}>
                    <code>{model.value}</code>
                    {model.sublabel && <span>{model.sublabel}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>

      <div className="setup-card">
        <h2 className="howto-heading">Once the game starts</h2>
        <ul className="howto-list">
          <li>
            When it’s your turn, the panel under the feed will prompt you directly — the game genuinely waits
            for your answer, with no timer, before continuing.
          </li>
          <li>
            <strong>God view</strong> (top right) shows everyone’s true role at all times, which is the best
            way to watch how the werewolves are playing their deception. Turn it off to only know what your
            own character would know, for a more immersive game.
          </li>
          <li>
            <strong>Pause / Continue</strong> (top right) freezes the game between turns and resumes it exactly
            where it left off, whenever you want.
          </li>
          <li>
            <strong>Voice Council</strong> is an explicit opt-in. Choose lifelike neural narration or a
            no-cost device voice, select ceremonial, measured, or urgent pacing, and mute, skip, or replay.
            Neural speech is AI-generated; visible persisted captions remain authoritative.
          </li>
          <li>
            Scroll down for the <strong>Agent Engineering Debug</strong> panel — drag to pan and scroll to zoom
            the live orchestration graph, and watch the activity feed for exactly when each agent’s turn
            starts, when it opens an MCP session, which tools it calls, and when it commits its decision.
          </li>
        </ul>
      </div>

      <div className="setup-card" style={{ marginTop: 20 }}>
        <h2 className="howto-heading">After the village falls silent</h2>
        <ul className="howto-list">
          <li><strong>Perspective</strong> reconstructs exactly what one agent knew, believed, remembered, and could legally do at a chosen event.</li>
          <li><strong>Deception report</strong> separates persisted facts from interpretation, then follows claims, suspicion shifts, vote pivots, and ignored clues.</li>
          <li><strong>Branch replay</strong> restores a human interrupt from a real LangGraph checkpoint, replaces one answer, and continues as a new immutable game.</li>
          <li><strong>Share replay</strong> publishes a sealed read-only snapshot. Public links exclude private actions; God Mode links require an extra secret and can expire or be revoked.</li>
          <li><Link href="/tournament"><strong>Model tournament</strong></Link> rotates roles across autonomous games and compares wins, deception, voting, survival, latency, tokens, and estimated spend.</li>
          <li><Link href="/relationships"><strong>Relationship archive</strong></Link> lets you inspect, edit, or erase opt-in memories between recurring personas. Previous secret roles are never carried forward.</li>
        </ul>
      </div>

      <div className="setup-card" style={{ marginTop: 20 }}>
        <h2 className="howto-heading">Comprehensive feature guides</h2>
        <p className="howto-p">
          The repository includes player-facing guides for every shipped enhancement, including where to find
          it, how to operate it, what its signals mean, controlled experiments to try, and conclusions the
          evidence does not support.
        </p>
        <ul className="howto-list">
          <li><a href="https://github.com/mk-tdev/village-of-shadows/blob/main/docs/player-guides/01-play-the-live-council.md">Play the live council</a> — negotiation, beliefs, notes, multiple humans, voices, and events.</li>
          <li><a href="https://github.com/mk-tdev/village-of-shadows/blob/main/docs/player-guides/02-configure-the-experiment.md">Configure the experiment</a> — roles, Agent Laboratory, relationships, and resilience.</li>
          <li><a href="https://github.com/mk-tdev/village-of-shadows/blob/main/docs/player-guides/03-use-the-post-game-laboratory.md">Use the post-game laboratory</a> — Perspective, deception, branches, and replays.</li>
          <li><a href="https://github.com/mk-tdev/village-of-shadows/blob/main/docs/player-guides/04-run-model-tournaments.md">Run model tournaments</a> — fair setup, metrics, costs, and analytical pitfalls.</li>
          <li><a href="https://github.com/mk-tdev/village-of-shadows/blob/main/docs/player-guides/05-read-the-observability-panels.md">Read observability correctly</a> — graph nodes, context, memory, tools, validation, and God Mode.</li>
        </ul>
      </div>

      <div style={{ marginTop: 22 }}>
        <Link className="btn btn-secondary" href="/setup">
          ← Back to setup
        </Link>
      </div>
    </div>
  );
}
