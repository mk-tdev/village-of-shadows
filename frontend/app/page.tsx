import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { EyeIcon, MoonIcon } from "@/components/icons";

export const metadata: Metadata = {
  title: "Village of Shadows | Enter an Agentic AI World",
  description:
    "Take a seat inside a living multi-agent game where six independent AI agents reason, remember, deceive, and act around one human player.",
};

const CAST = [
  { name: "Mara", image: "/characters/full/mara.webp", mind: "Cautious observer" },
  { name: "Tomas", image: "/characters/full/tomas.webp", mind: "Aggressive interrogator" },
  { name: "Elin", image: "/characters/full/elin.webp", mind: "Analytical skeptic" },
  { name: "Bram", image: "/characters/full/bram.webp", mind: "Persuasive optimist" },
  { name: "Sable", image: "/characters/full/sable.webp", mind: "Deceptive strategist" },
  { name: "Corvin", image: "/characters/full/corvin.webp", mind: "Suspicious investigator" },
  { name: "Petra", image: "/characters/full/petra.webp", mind: "Calm mediator" },
];

const MINDS = [
  { name: "Mara", image: "/portraits/mara.webp", angle: "-90deg", human: false },
  { name: "Tomas", image: "/portraits/tomas.webp", angle: "-38deg", human: false },
  { name: "Elin", image: "/portraits/elin.webp", angle: "14deg", human: false },
  { name: "Bram", image: "/portraits/bram.webp", angle: "66deg", human: false },
  { name: "You", image: "/portraits/petra.webp", angle: "118deg", human: true },
  { name: "Sable", image: "/portraits/sable.webp", angle: "170deg", human: false },
  { name: "Corvin", image: "/portraits/corvin.webp", angle: "222deg", human: false },
];

const EXPERIENCES = [
  {
    index: "01",
    title: "Incomplete information",
    text: "Every mind sees a different version of the same conversation. Secret roles and private evidence change what each agent believes.",
    signal: "PRIVATE CONTEXT",
  },
  {
    index: "02",
    title: "Decisions through tools",
    text: "Agents do not merely produce dialogue. They investigate, protect, accuse, vote, and deceive through identity-bound MCP tools.",
    signal: "VALIDATED ACTIONS",
  },
  {
    index: "03",
    title: "You are inside the graph",
    text: "When your turn arrives, LangGraph genuinely suspends. The world waits until you speak, act, or cast your vote.",
    signal: "HUMAN INTERRUPT",
  },
];

const PHASES = [
  ["Night", "Private agents investigate, protect, and hunt."],
  ["Dawn", "The shared world resolves what happened in secret."],
  ["Council", "Seven perspectives collide in one public conversation."],
  ["Vote", "Human and AI choices cross the same rule boundary."],
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero" aria-labelledby="landing-title">
        <Image
          className="landing-hero-bg"
          src="/scenes/moonlit-village.png"
          alt="A moonlit medieval village surrounding the council chamber"
          fill
          priority
          sizes="100vw"
        />
        <div className="landing-hero-shade" />
        <div className="landing-fog landing-fog-one" />
        <div className="landing-fog landing-fog-two" />

        <nav className="landing-nav" aria-label="Main navigation">
          <Link className="landing-mark" href="/" aria-label="Village of Shadows home">
            <span><MoonIcon /></span>
            <strong>VILLAGE OF SHADOWS</strong>
          </Link>
          <div className="landing-nav-links">
            <Link href="#the-system">The system</Link>
            <Link href="/how-to-play">How to play</Link>
            <Link className="landing-nav-enter" href="/setup">Enter the village</Link>
          </div>
        </nav>

        <div className="landing-hero-content">
          <div className="landing-eyebrow">
            <span className="landing-live-dot" />
            A live multi-agent social experiment
          </div>
          <h1 id="landing-title">
            Sit among<br />
            <em>the agents.</em>
          </h1>
          <p className="landing-hero-copy">
            Six independent AI minds. One human player. Secret roles, private memories,
            competing objectives—and no script for what happens next.
          </p>
          <div className="landing-hero-actions">
            <Link className="landing-primary-action" href="/setup">
              <span>Take your seat</span>
              <b aria-hidden="true">→</b>
            </Link>
            <Link className="landing-text-action" href="#the-system">
              See how the world thinks
            </Link>
          </div>
          <dl className="landing-hero-stats">
            <div><dt>06</dt><dd>AI minds</dd></div>
            <div><dt>01</dt><dd>Human inside</dd></div>
            <div><dt>∞</dt><dd>Unscripted outcomes</dd></div>
          </dl>
        </div>

        <div className="landing-cast" aria-label="The seven village personas">
          {CAST.map((member) => (
            <article className="landing-character" key={member.name}>
              <Image src={member.image} alt={member.name} fill sizes="(max-width: 760px) 28vw, 11vw" />
              <span><b>{member.name}</b><small>{member.mind}</small></span>
            </article>
          ))}
        </div>

        <a className="landing-scroll-cue" href="#the-system" aria-label="Scroll to learn about the system">
          <span /> Explore the world
        </a>
      </section>

      <div className="landing-signal-strip" aria-hidden="true">
        <div>
          <span>LANGGRAPH ORCHESTRATION</span><i />
          <span>PRIVATE MEMORY</span><i />
          <span>MCP TOOL CALLS</span><i />
          <span>HUMAN IN THE LOOP</span><i />
          <span>PARTIAL OBSERVABILITY</span><i />
          <span>EMERGENT BEHAVIOR</span>
        </div>
      </div>

      <section className="landing-system landing-section" id="the-system" aria-labelledby="system-title">
        <div className="landing-section-heading">
          <span>THE LIVING SYSTEM</span>
          <h2 id="system-title">The graph controls the world.<br /><em>The agents create the story.</em></h2>
          <p>
            This is not a chatbot taking turns with itself. Every seat owns a model,
            personality, role, memory, and private view of the same evolving world.
          </p>
        </div>

        <div className="landing-system-grid">
          <div className="landing-orbit" aria-label="Six AI agents and one human connected to a shared LangGraph world">
            <div className="landing-orbit-ring landing-orbit-ring-outer" />
            <div className="landing-orbit-ring landing-orbit-ring-inner" />
            <div className="landing-world-core">
              <span>SHARED WORLD</span>
              <strong>LangGraph</strong>
              <small>state · turns · interrupts</small>
            </div>
            {MINDS.map((mind, index) => (
              <div
                className={`landing-mind${mind.human ? " is-human" : ""}`}
                style={{ "--mind-angle": mind.angle, "--mind-index": index } as CSSProperties}
                key={mind.name}
              >
                <span><Image src={mind.image} alt="" fill sizes="54px" /></span>
                <b>{mind.name}</b>
                <small>{mind.human ? "HUMAN" : `AI ${index + 1}`}</small>
              </div>
            ))}
          </div>

          <div className="landing-system-copy">
            <div className="landing-code-kicker"><span /> WORLD STATE / ACTIVE</div>
            <h3>Seven seats. Seven private truths.</h3>
            <p>
              LangGraph decides whose turn it is and which actions are legal. It never decides
              whom an agent should trust, accuse, protect, investigate, or eliminate.
            </p>
            <ul className="landing-seat-owns">
              <li><span>MODEL</span><b>Different reasoning engines</b></li>
              <li><span>PERSONA</span><b>Different social behavior</b></li>
              <li><span>MEMORY</span><b>Independent conversation history</b></li>
              <li><span>KNOWLEDGE</span><b>Role-authorized information only</b></li>
            </ul>
            <div className="landing-agent-event">
              <span className="landing-event-icon"><EyeIcon /></span>
              <p><small>AGENT EVENT · ROUND 02</small><strong>Sable revised suspicion of Bram</strong></p>
              <b>72%</b>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-experience landing-section" aria-labelledby="experience-title">
        <div className="landing-section-heading is-compact">
          <span>WHAT MAKES IT AGENTIC</span>
          <h2 id="experience-title">A system you can play.<br /><em>And inspect.</em></h2>
        </div>
        <div className="landing-experience-grid">
          {EXPERIENCES.map((experience) => (
            <article key={experience.index}>
              <header><span>{experience.index}</span><small>{experience.signal}</small></header>
              <div className={`landing-experience-visual visual-${experience.index}`} aria-hidden="true">
                <i /><i /><i /><i />
              </div>
              <h3>{experience.title}</h3>
              <p>{experience.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-round landing-section" aria-labelledby="round-title">
        <div className="landing-round-intro">
          <span>ONE ROUND · MANY MINDS</span>
          <h2 id="round-title">The night changes<br />what everyone knows.</h2>
          <p>Then the council must decide what to believe.</p>
        </div>
        <ol className="landing-phase-track">
          {PHASES.map(([phase, text], index) => (
            <li key={phase}>
              <span>0{index + 1}</span>
              <div><h3>{phase}</h3><p>{text}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-final" aria-labelledby="final-title">
        <Image src="/scenes/moonlit-village.png" alt="" fill sizes="100vw" />
        <div className="landing-final-shade" />
        <div className="landing-final-content">
          <span>THE COUNCIL IS WAITING</span>
          <h2 id="final-title">Do not just watch<br />agents work.</h2>
          <p>Sit among them. Listen carefully. Decide whom you believe.</p>
          <Link className="landing-primary-action" href="/setup">
            <span>Enter Village of Shadows</span><b aria-hidden="true">→</b>
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <Link className="landing-mark" href="/"><span><MoonIcon /></span><strong>VILLAGE OF SHADOWS</strong></Link>
        <p>An open multi-agent learning experience built with LangGraph and MCP.</p>
        <div><Link href="/how-to-play">How to play</Link><Link href="/setup">Configure agents</Link><Link href="/connect">Connect</Link></div>
      </footer>
    </main>
  );
}
