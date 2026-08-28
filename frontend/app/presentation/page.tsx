import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import PresentationDeckControls from "./PresentationDeckControls";
import styles from "./presentation.module.css";

export const metadata: Metadata = {
  title: "Village of Shadows | GOAI Semi-final Presentation",
  description:
    "A web presentation for Village of Shadows, a multi-agent AI learning lab built with LangGraph, MCP, Next.js, FastAPI, PostgreSQL, Vercel, and Azure.",
};

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
  accent?: "blue" | "amber" | "mint" | "red";
};

const slides: Slide[] = [
  {
    eyebrow: "Boundless Agents / AI + Education",
    title: "Village of Shadows",
    body:
      "A playable multi-agent AI learning lab where the learner sits inside the world with six autonomous agents.",
    bullets: [
      "Six AI seats plus one human participant.",
      "Each participant has different knowledge, memory, incentives, and tools.",
      "The learning goal is to understand agentic systems through a complete scenario, not a fixed chatbot workflow.",
    ],
    image: "/presentation/game-poster.webp",
    imageAlt: "Village of Shadows landing page with human-like characters in a moonlit village.",
    imageCaption: "Current hosted experience: enter the village before configuring agents.",
    accent: "amber",
  },
  {
    eyebrow: "Problem and target learner",
    title: "Why this project exists",
    body:
      "Most agentic-AI tutorials still teach prompt -> tool -> report. Useful, but too clean for the hard parts of real agentic systems.",
    bullets: [
      "Agents may not share the same context or incentives.",
      "Human participation can be inside the workflow, not outside as approval.",
      "Tool calls need identity, authorization, validation, and replay safety.",
      "Memory and model choice change behavior across rounds.",
    ],
    image: "/presentation/game-play.webp",
    imageAlt: "A dark game explanation screen showing the night phases of play.",
    imageCaption: "The game makes hidden information and changing knowledge visible.",
    accent: "blue",
  },
  {
    eyebrow: "Product workflow",
    title: "The learner completes a full loop",
    body:
      "The app is designed as a closed-loop lesson: configure, predict, play, observe, debrief, and compare.",
    bullets: [
      "Choose a human seat and configure AI players with models and personalities.",
      "Run model preflight before the game starts.",
      "Play while LangGraph moves through night, discussion, voting, resolution, and interrupts.",
      "Use God Mode and Learning Debrief to inspect evidence and plan the next experiment.",
    ],
    image: "/presentation/flow.webp",
    imageAlt: "A system flow screenshot explaining incomplete information, tool decisions, and human participation.",
    imageCaption: "A system you can play and inspect.",
    accent: "mint",
  },
  {
    eyebrow: "Agent architecture",
    title: "Structure makes autonomy inspectable",
    body:
      "LangGraph controls the world. Agents control their choices. MCP tools and server validation sit between intention and state change.",
    bullets: [
      "World graph: phases, turn order, interrupts, checkpoints, win resolution.",
      "Seat minds: private histories, personas, roles, notes, beliefs, and model-specific decisions.",
      "Tool boundary: MCP schemas, connection-bound identity, phase checks, target checks, accepted/rejected logs.",
      "Persistence: PostgreSQL game state, decisions, private logs, voice cache, replay exports, and checkpoints.",
    ],
    image: "/presentation/game-engineering.webp",
    imageAlt: "Engineering debug panel with LangGraph orchestration and agent token usage.",
    imageCaption: "Live engineering view: graph movement, context usage, and activity.",
    accent: "amber",
  },
  {
    eyebrow: "Human in the loop",
    title: "The human is not outside the system",
    body:
      "When the human must speak, vote, or act, LangGraph suspends. The world waits for the player.",
    bullets: [
      "Human actions and AI actions pass through the same game-rule validation layer.",
      "Multi-human rooms use seat-specific links and server-side private filtering.",
      "The debrief reconstructs where suspension occurred and how the human action changed the run.",
    ],
    image: "/presentation/game-chat.webp",
    imageAlt: "Game council chat showing players, discussion, and human input.",
    imageCaption: "Live council discussion with the human seated among agents.",
    accent: "red",
  },
  {
    eyebrow: "God Mode and traceability",
    title: "God Mode reveals what dialogue hides",
    body:
      "The teaching interface exposes observable evidence without pretending to reveal hidden chain-of-thought.",
    bullets: [
      "Live activity feed: graph steps, MCP sessions, tool calls, validation results, memory updates.",
      "Context panels: permitted prompt/context for the active seat.",
      "Model metrics: provider, model, latency, tokens, retries, and fallback status.",
      "Belief ledgers: how each agent revised suspicions over time.",
    ],
    image: "/presentation/agent-perspective.webp",
    imageAlt: "God Mode agent perspective view showing private context, tool actions, and rationale.",
    imageCaption: "A single agent perspective with permitted context and tool history.",
    accent: "blue",
  },
  {
    eyebrow: "Educational outcome",
    title: "The learning outcome is measurable",
    body:
      "The semi-final version makes education explicit instead of leaving it implied by the gameplay.",
    bullets: [
      "Prediction before play establishes an expectation to compare against evidence.",
      "Learning Debrief identifies interrupts, partial observability, tools, validation, memory growth, and model differences.",
      "A local concept check and exportable learning report close the loop.",
      "Replay, branch, and tournament features support controlled comparison.",
    ],
    image: "/presentation/learning-debrief.webp",
    imageAlt: "Learning Debrief page showing post-game educational evidence and reflection.",
    imageCaption: "Post-game debrief turns play into inspectable learning evidence.",
    accent: "mint",
  },
  {
    eyebrow: "Demo readiness",
    title: "Current runnable demo",
    body:
      "The project is reviewer-accessible and reproducible through both hosted and local paths.",
    bullets: [
      "Frontend: Vercel public demo. Backend: Azure Container Apps FastAPI service.",
      "Database: Azure Database for PostgreSQL for game records and checkpoints.",
      "Local setup: Docker Compose starts PostgreSQL, backend, and frontend together.",
      "Public demo policy: Mock + OpenAI only; other providers remain documented for self-hosters.",
      "Verification record: 70 backend tests passing and frontend production build passing.",
    ],
    image: "/presentation/game-play-selection.webp",
    imageAlt: "Setup page where a player selects a seat and configures model providers.",
    imageCaption: "Setup and model preflight before a game can begin.",
    accent: "amber",
  },
  {
    eyebrow: "Data and safety",
    title: "Synthetic by default, bounded by design",
    body:
      "The project includes a standalone Data Sources and Compliance Statement for the semi-final package.",
    bullets: [
      "No model is trained or fine-tuned by this project.",
      "No student account, academic record, legal name, email, grade, or institutional record is required.",
      "API keys are backend environment variables and are not exposed in browser bundles or replay exports.",
      "The app is formative educational software and does not replace teachers, exams, or professional educational services.",
    ],
    image: "/presentation/game-ground.webp",
    imageAlt: "The live jungle council with human-like characters standing in a fictional village scene.",
    imageCaption: "A fictional learning environment, not real learner data.",
    accent: "red",
  },
];

const links = [
  { href: "https://village-of-shadows.vercel.app/", label: "Live demo" },
  { href: "https://github.com/mk-tdev/village-of-shadows", label: "GitHub" },
  { href: "/setup", label: "Play" },
];

export default function PresentationPage() {
  return (
    <main className={styles.page}>
      <nav className={styles.nav} aria-label="Presentation navigation">
        <Link href="/" className={styles.brand}>Village of Shadows</Link>
        <div className={styles.navLinks}>
          {links.map((link) => (
            <Link key={link.href} href={link.href} className={styles.navLink}>
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      <PresentationDeckControls slides={slides.map((slide) => slide.title)} />

      {slides.map((slide, index) => (
        <section
          id={`slide-${index + 1}`}
          className={`${styles.slide} ${styles[slide.accent ?? "blue"]}`}
          key={slide.title}
          aria-labelledby={`slide-title-${index + 1}`}
        >
          <div className={styles.copy}>
            <p className={styles.eyebrow}>{slide.eyebrow}</p>
            <h1 id={`slide-title-${index + 1}`}>{slide.title}</h1>
            <p className={styles.body}>{slide.body}</p>
            <ul>
              {slide.bullets.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </div>

          {slide.image ? (
            <figure className={styles.visual}>
              <Image
                src={slide.image}
                alt={slide.imageAlt ?? "Village of Shadows presentation screenshot"}
                fill
                priority={index === 0}
                sizes="(max-width: 900px) 92vw, 50vw"
              />
              {slide.imageCaption ? <figcaption>{slide.imageCaption}</figcaption> : null}
            </figure>
          ) : null}

          <footer className={styles.footer}>
            <span>GOAI 2026 Semi-final</span>
            <span>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
          </footer>
        </section>
      ))}
    </main>
  );
}
