"use client";

import Image from "next/image";
import Link from "next/link";
import { usePreferences } from "@/components/Preferences";
import PresentationDeckControls from "./PresentationDeckControls";
import styles from "./presentation.module.css";

type Slide = {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  image?: string;
  imageAlt?: string;
  imageCaption?: string;
  imageFit?: "cover" | "contain";
  accent?: "blue" | "amber" | "mint" | "red";
};

const englishSlides: Slide[] = [
  {
    eyebrow: "Boundless Agents / AI + Education",
    title: "Learn agentic AI from inside the system",
    body:
      "Village of Shadows is a playable AI learning lab. The learner enters a shared world with six autonomous agents, then studies why the system behaved as it did.",
    bullets: [
      "Predict agent behavior before the run.",
      "Participate in a complete multi-agent task, not a scripted chatbot flow.",
      "Inspect orchestration, private context, memory, tools, validation, and recovery.",
      "Explain the evidence, then replay with a different configuration.",
    ],
    image: "/presentation/game-poster.webp",
    imageAlt: "Village of Shadows landing page with human-like characters in a moonlit village.",
    imageCaption: "Six AI agents. One human learner. One unscripted world.",
    accent: "amber",
  },
  {
    eyebrow: "The learning gap",
    title: "Knowing the parts is not understanding the system",
    body:
      "Most tutorials isolate prompts, tools, memory, and graphs. Learners rarely experience what happens when those parts meet incomplete information, competing objectives, failures, and a human inside the workflow.",
    bullets: [
      "If the Seer discovers a role privately, who knows it and who only heard a claim?",
      "If an agent requests an illegal action, where is it rejected?",
      "When the human must act, what pauses and what state survives?",
      "When two models see the same discussion, why do they diverge?",
    ],
    image: "/presentation/game-play.webp",
    imageAlt: "A dark game explanation screen showing the night phases of play.",
    imageCaption: "Abstract architecture questions become observable consequences.",
    accent: "blue",
  },
  {
    eyebrow: "The laboratory method",
    title: "Every game is a repeatable learning experiment",
    body:
      "The story changes, but the learning method remains consistent: predict, configure, participate, inspect, explain, and replay.",
    bullets: [
      "Configure models, roles, personalities, and the human seat.",
      "Predict how the agents will behave before play begins.",
      "Participate while LangGraph runs a complete task chain.",
      "Debrief, answer the concept check, export evidence, and replay.",
    ],
    image: "/presentation/flow.webp",
    imageAlt: "A system flow screenshot explaining incomplete information, tool decisions, and human participation.",
    imageCaption: "Predict -> configure -> participate -> inspect -> explain -> replay.",
    accent: "mint",
  },
  {
    eyebrow: "Architecture as curriculum",
    title: "Every technical boundary teaches a concept",
    body:
      "The architecture is instrumented so learners can connect visible behavior to system design.",
    bullets: [
      "LangGraph world: phases, state transitions, interrupts, checkpoints, and recovery.",
      "Private agent minds: role, persona, permitted context, memory, and model decisions.",
      "MCP boundary: identity, schema, authorization, validation, and auditable outcomes.",
      "PostgreSQL evidence: sessions, decisions, memories, reports, and replay.",
    ],
    image: "/presentation/game-engineering.webp",
    imageAlt: "Engineering debug panel with LangGraph orchestration and agent token usage.",
    imageCaption: "The graph governs the world; agents decide how to behave inside it.",
    accent: "amber",
  },
  {
    eyebrow: "Two representative learning paths",
    title: "Different roles create different learning paths",
    body:
      "The same world teaches different concepts from different seats. Role-specific information and incentives change what the learner can observe, claim, and test.",
    bullets: [
      "Seer: compare a private investigation result with public claims and verified knowledge.",
      "Werewolf: coordinate privately while managing a conflicting public objective.",
      "Villager: reason from public discussion without privileged information.",
      "Human: observe LangGraph suspend, preserve state, resume, and validate the action.",
    ],
    image: "/presentation/game-chat.webp",
    imageAlt: "Game council chat showing players, discussion, and human input.",
    imageCaption: "Same shared world. Different evidence, incentives, and learning questions.",
    accent: "red",
  },
  {
    eyebrow: "Instructor view and traceability",
    title: "God Mode turns a run into a teachable investigation",
    body:
      "An instructor can pause, inspect permitted evidence, and ask learners to defend an explanation without claiming access to hidden chain-of-thought.",
    bullets: [
      "Inspect graph steps, MCP sessions, tool calls, validation results, and memory updates.",
      "Compare public dialogue with the permitted context of a single seat.",
      "Review provider, model, latency, tokens, retries, and fallback status.",
      "Replay or branch to test a different model, persona, or decision.",
    ],
    image: "/presentation/agent-perspective.webp",
    imageAlt: "God Mode agent perspective view showing private context, tool actions, and rationale.",
    imageCaption: "The interface supplies formative evidence; the instructor owns formal assessment.",
    accent: "blue",
  },
  {
    eyebrow: "Observable learning outcomes",
    title: "The learner must explain the system using evidence",
    body:
      "The goal is not simply to win. The learner should demonstrate what the graph decided, what an agent decided, and where validation changed an action.",
    bullets: [
      "A pre-game prediction establishes an expectation to test.",
      "Learning Debrief maps interrupts, partial observability, tools, validation, and memory to run evidence.",
      "A five-question concept check and exportable learning report close the loop.",
      "Honest boundary: formative evidence exists now; a controlled classroom learning-gain study is next.",
    ],
    image: "/presentation/learning-debrief.webp",
    imageAlt: "Learning Debrief page showing post-game educational evidence and reflection.",
    imageCaption: "Implemented now: prediction, evidence, concept check, reflection, report, and replay.",
    accent: "mint",
  },
  {
    eyebrow: "Complete task chain",
    title: "The finals demo is live, changeable, and verifiable",
    body:
      "A judge can change the seat, model, personality, or action and still observe the complete boundary from learner input to verified result.",
    bullets: [
      "Input: configure seats, models, personalities, and a learning prediction.",
      "Processing: private context + memory + model decision.",
      "Action: MCP tool call -> identity and rule validation -> state transition.",
      "Delivery: activity -> result -> debrief -> concept check -> exported report.",
      "Abnormal paths are logged, retried, rejected, or converted to safe validated actions.",
    ],
    image: "/presentation/game-play-selection.webp",
    imageAlt: "Setup page where a player selects a seat and configures model providers.",
    imageCaption: "Model preflight catches unsupported configurations before a learning session begins.",
    accent: "amber",
  },
  {
    eyebrow: "Safe, open, and reusable",
    title: "A lab others can run, inspect, and extend",
    body:
      "The environment is synthetic by default, bounded by validated actions, and published as a reusable engineering reference.",
    bullets: [
      "No model training, academic record, grade, legal name, or student account is required.",
      "Provider keys remain server-side and are excluded from browser bundles and replay exports.",
      "Mock mode provides a deterministic, low-cost path for classrooms and reviewers.",
      "Open code, Docker setup, tests, deployment guides, examples, and notices support reuse.",
    ],
    image: "/presentation/game-ground.webp",
    imageAlt: "The live jungle council with human-like characters standing in a fictional village scene.",
    imageCaption: "Formative educational software, not a replacement for teachers or formal assessment.",
    accent: "red",
  },

  {
    eyebrow: "One connected learning system",
    title: "Sit among the agents - then explain what happened",
    body:
      "The interface creates the experience. The agent engine creates bounded autonomy. The evidence layer turns each run into a lesson that can be inspected, discussed, and repeated.",
    bullets: [
      "Vercel delivers setup, live game, God Mode, replay, and Learning Debrief.",
      "Azure runs the API and streams live activity to the learning interface.",
      "The engine combines LangGraph orchestration, private agent minds, and MCP validation.",
      "PostgreSQL preserves evidence; provider keys stay server-side; Mock + OpenAI enable comparison.",
    ],
    image: "/presentation/architecture-map.webp",
    imageAlt:
      "Architecture diagram showing the Vercel frontend, Azure backend, agentic game engine, model providers, and PostgreSQL storage.",
    imageCaption: "A runnable AI learning lab: experience, autonomy, evidence, and replay.",
    imageFit: "contain",
    accent: "blue",
  },
];

const chineseSlides: Slide[] = [
  {
    eyebrow: "无界智能体 / AI + 教育",
    title: "从系统内部学习智能体 AI",
    body: "暗影村庄是一座可玩的 AI 学习实验室。学习者与六个自主智能体进入同一个世界，并在游戏后研究系统为何如此行动。",
    bullets: [
      "运行前预测智能体的行为。",
      "参与完整的多智能体任务，而不是预设的聊天机器人流程。",
      "检查编排、私有上下文、记忆、工具、验证与故障恢复。",
      "根据证据作出解释，再用不同配置重新实验。",
    ],
    image: "/presentation/game-poster.webp",
    imageAlt: "月光下的暗影村庄与写实角色。",
    imageCaption: "六个 AI 智能体，一位人类学习者，一个没有预写剧本的世界。",
    accent: "amber",
  },
  {
    eyebrow: "学习缺口",
    title: "认识组件，不等于理解系统",
    body: "多数教程会分别介绍提示词、工具、记忆和图编排，却很少让学习者亲身观察它们如何与信息不完整、目标冲突、故障以及流程中的人类共同作用。",
    bullets: [
      "预言家私下查验身份后，谁真正知道结果，谁只是听到一个说法？",
      "智能体请求非法动作时，系统在哪里拒绝它？",
      "人类必须行动时，什么被暂停，什么状态会被保留？",
      "两个模型看到相同讨论时，为什么会得出不同结论？",
    ],
    image: "/presentation/game-play.webp",
    imageAlt: "展示夜晚阶段的游戏说明画面。",
    imageCaption: "抽象的架构问题，在游戏中变成可观察的后果。",
    accent: "blue",
  },
  {
    eyebrow: "实验室方法",
    title: "每局游戏都是可重复的学习实验",
    body: "故事会变化，但学习方法保持一致：预测、配置、参与、检查、解释，再重新实验。",
    bullets: [
      "配置模型、角色、性格以及人类座位。",
      "在游戏开始前预测智能体的行为。",
      "参与 LangGraph 驱动的完整任务闭环。",
      "完成复盘与概念检查，导出证据并重新实验。",
    ],
    image: "/presentation/flow.webp",
    imageAlt: "解释私有信息、工具决策与人类参与的系统流程。",
    imageCaption: "预测 → 配置 → 参与 → 检查 → 解释 → 重放。",
    accent: "mint",
  },
  {
    eyebrow: "架构即课程",
    title: "每一道技术边界都在教授一个概念",
    body: "系统架构被完整观测，使学习者能够把可见行为与底层设计联系起来。",
    bullets: [
      "LangGraph 世界：阶段、状态转换、中断、检查点与恢复。",
      "私有智能体心智：角色、性格、授权上下文、记忆与模型决策。",
      "MCP 边界：身份、结构、授权、验证与可审计结果。",
      "PostgreSQL 证据：会话、决策、记忆、报告与重放。",
    ],
    image: "/presentation/game-engineering.webp",
    imageAlt: "展示 LangGraph 编排与上下文使用情况的工程面板。",
    imageCaption: "图控制世界规则，智能体决定如何在世界中行动。",
    accent: "amber",
  },
  {
    eyebrow: "两条代表性学习路径",
    title: "不同角色，带来不同的学习路径",
    body: "同一个世界会从不同座位教授不同概念。角色专属的信息与动机会改变学习者能够观察、声称和验证的内容。",
    bullets: [
      "预言家：比较私有查验结果、公开说法与已验证知识。",
      "狼人：在私下协作的同时管理相互冲突的公开目标。",
      "村民：只能依据公开讨论进行推理。",
      "人类：观察 LangGraph 暂停、保存状态、恢复并验证动作。",
    ],
    image: "/presentation/game-chat.webp",
    imageAlt: "展示玩家、讨论与人类输入的游戏议会。",
    imageCaption: "同一个共享世界，不同的证据、动机与学习问题。",
    accent: "red",
  },
  {
    eyebrow: "教师视角与可追溯性",
    title: "上帝模式把一次运行变成可教学的调查",
    body: "教师可以暂停流程、检查被允许展示的证据，并要求学习者为自己的解释辩护，而不声称能够查看模型隐藏的思维链。",
    bullets: [
      "检查图步骤、MCP 会话、工具调用、验证结果与记忆更新。",
      "比较公开讨论与单个座位被允许看到的上下文。",
      "查看供应商、模型、延迟、Token、重试与回退状态。",
      "通过重放或分支测试不同模型、性格或决策。",
    ],
    image: "/presentation/agent-perspective.webp",
    imageAlt: "上帝模式中的私有上下文、工具行为与陈述理由。",
    imageCaption: "系统提供形成性学习证据，正式评估仍由教师负责。",
    accent: "blue",
  },
  {
    eyebrow: "可观察的学习成果",
    title: "学习者必须用证据解释系统",
    body: "目标不只是赢得游戏。学习者需要说明图做了什么决定、智能体做了什么决定，以及验证层在何处改变了动作。",
    bullets: [
      "赛前预测建立一个可以被证据检验的预期。",
      "学习复盘将中断、局部可观测性、工具、验证和记忆映射到运行证据。",
      "五道概念题与可导出的学习报告完成闭环。",
      "诚实边界：现已具备形成性证据；下一步才是受控课堂学习效果研究。",
    ],
    image: "/presentation/learning-debrief.webp",
    imageAlt: "展示教育证据与反思的学习复盘页面。",
    imageCaption: "现已实现：预测、证据、概念检查、反思、报告与重放。",
    accent: "mint",
  },
  {
    eyebrow: "完整任务闭环",
    title: "决赛演示可运行、可改变、可验证",
    body: "评委可以改变座位、模型、性格或动作，并继续观察从学习者输入到验证结果的完整系统边界。",
    bullets: [
      "输入：配置座位、模型、性格与学习预测。",
      "处理：私有上下文 + 记忆 + 模型决策。",
      "动作：MCP 工具调用 → 身份与规则验证 → 状态转换。",
      "交付：实时活动 → 结果 → 复盘 → 概念检查 → 导出报告。",
      "异常路径会被记录、重试、拒绝或转换为安全且有效的动作。",
    ],
    image: "/presentation/game-play-selection.webp",
    imageAlt: "选择座位并配置模型的设置页面。",
    imageCaption: "模型预检会在学习会话开始前发现不受支持的配置。",
    accent: "amber",
  },
  {
    eyebrow: "安全、开放、可复用",
    title: "任何人都能运行、检查和扩展的实验室",
    body: "环境默认使用合成数据，所有动作都受验证边界约束，并以可复用的工程参考形式开源。",
    bullets: [
      "无需模型训练、学业记录、成绩、真实姓名或学生账户。",
      "供应商密钥仅保留在服务器端，不进入浏览器包或重放导出。",
      "Mock 模式为课堂和评审提供确定性、低成本的运行路径。",
      "开源代码包含 Docker 配置、测试、部署指南、示例与第三方声明。",
    ],
    image: "/presentation/game-ground.webp",
    imageAlt: "虚构村庄中的写实丛林议会场景。",
    imageCaption: "形成性教育软件，不替代教师或正式评估。",
    accent: "red",
  },
  {
    eyebrow: "一个完整的学习系统",
    title: "坐进智能体之中，然后解释发生了什么",
    body: "界面创造体验，智能体引擎创造有边界的自主性，证据层则把每次运行转化为可检查、可讨论、可重复的课程。",
    bullets: [
      "Vercel 提供配置、实时游戏、上帝模式、重放与学习复盘。",
      "Azure 运行 API，并把实时活动传输到学习界面。",
      "引擎结合 LangGraph 编排、私有智能体心智与 MCP 验证。",
      "PostgreSQL 保存证据；密钥留在服务器端；Mock 与 OpenAI 支持对比。",
    ],
    image: "/presentation/architecture-map.webp",
    imageAlt: "展示前端、后端、智能体引擎、模型与存储的架构图。",
    imageCaption: "一座可运行的 AI 学习实验室：体验、自主、证据与重放。",
    imageFit: "contain",
    accent: "blue",
  },
];

const links = {
  en: [
    { href: "https://village-of-shadows.vercel.app/", label: "Live demo" },
    { href: "https://github.com/mk-tdev/village-of-shadows", label: "GitHub" },
    { href: "/setup", label: "Play" },
  ],
  zh: [
    { href: "https://village-of-shadows.vercel.app/", label: "现场演示" },
    { href: "https://github.com/mk-tdev/village-of-shadows", label: "GitHub" },
    { href: "/setup", label: "开始游戏" },
  ],
};

export default function PresentationContent() {
  const { language, setLanguage } = usePreferences();
  const slides = language === "zh" ? chineseSlides : englishSlides;
  const localizedLinks = links[language];

  return (
    <main className={styles.page} data-language={language}>
      <nav className={styles.nav} aria-label={language === "zh" ? "演示文稿导航" : "Presentation navigation"}>
        <Link href="/" className={styles.brand}>{language === "zh" ? "暗影村庄" : "Village of Shadows"}</Link>
        <div className={styles.navLinks}>
          {localizedLinks.map((link) => (
            <Link key={link.href} href={link.href} className={styles.navLink}>{link.label}</Link>
          ))}
          <button
            type="button"
            className={styles.navLink}
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            aria-label={language === "zh" ? "Switch presentation to English" : "将演示文稿切换为中文"}
          >
            {language === "zh" ? "EN" : "中文"}
          </button>
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
            <ul>{slide.bullets.map((item) => <li key={item}>{item}</li>)}</ul>
          </div>

          <figure className={`${styles.visual} ${slide.imageFit === "contain" ? styles.containVisual : ""}`}>
            <Image
              src={slide.image ?? "/presentation/game-poster.webp"}
              alt={slide.imageAlt ?? (language === "zh" ? "暗影村庄演示画面" : "Village of Shadows presentation screenshot")}
              fill
              priority={index === 0}
              sizes="(max-width: 900px) 92vw, 50vw"
            />
            {slide.imageCaption ? <figcaption>{slide.imageCaption}</figcaption> : null}
          </figure>

          <footer className={styles.footer}>
            <span>{language === "zh" ? "GOAI 2026 决赛 · AI + 教育" : "GOAI 2026 Finals · AI + Education"}</span>
            <span>{String(index + 1).padStart(2, "0")} / {String(slides.length).padStart(2, "0")}</span>
          </footer>
        </section>
      ))}
    </main>
  );
}
