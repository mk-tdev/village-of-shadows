"use client";

import { usePreferences } from "./Preferences";

const CHINESE: Record<string, string> = {
  "The system": "系统原理",
  "Presentation": "项目演示",
  "How to play": "玩法说明",
  "Tournament lab": "模型竞赛",
  "Game archive": "游戏档案",
  "Explore the village": "探索村庄",
  "Start game": "开始游戏",
  "A live multi-agent social experiment": "一个实时运行的多智能体社会实验",
  "Sit among": "坐在",
  "the agents.": "智能体之间。",
  "Six independent AI minds. One human player. Secret roles, private memories, competing objectives—and no script for what happens next.": "六个独立的 AI 智能体，一名人类玩家。秘密身份、独立记忆与相互冲突的目标，共同产生无法预先编写的故事。",
  "Start Game Setup": "直接配置并开始游戏",
  "Explore the village first": "先探索村庄",
  "AI minds": "AI 智能体",
  "Human inside": "人类参与者",
  "Unscripted outcomes": "非预设结果",
  "Cautious observer": "谨慎的观察者",
  "Aggressive interrogator": "强势的质询者",
  "Analytical skeptic": "理性的怀疑者",
  "Persuasive optimist": "善于说服的乐观者",
  "Deceptive strategist": "擅长误导的策略家",
  "Suspicious investigator": "多疑的调查者",
  "Calm mediator": "冷静的调解者",
  "Explore the world": "了解这个世界",
  "THE LIVING SYSTEM": "实时运行的系统",
  "The graph controls the world.": "图管理世界。",
  "The agents create the story.": "智能体创造故事。",
  "This is not a chatbot taking turns with itself. Every seat owns a model, personality, role, memory, and private view of the same evolving world.": "这不是一个轮流发言的聊天机器人。每个座位都有自己的模型、人格、角色、记忆，以及对同一世界的私有视角。",
  "SHARED WORLD": "共享世界",
  "state · turns · interrupts": "状态 · 回合 · 中断",
  "You": "你",
  "HUMAN": "人类",
  "WORLD STATE / ACTIVE": "世界状态 / 运行中",
  "Seven seats. Seven private truths.": "七个座位，七种私有视角。",
  "LangGraph decides whose turn it is and which actions are legal. It never decides whom an agent should trust, accuse, protect, investigate, or eliminate.": "LangGraph 决定行动顺序与合法边界，但不会替智能体决定信任、指控、保护、调查或淘汰谁。",
  "MODEL": "模型",
  "Different reasoning engines": "不同的推理模型",
  "PERSONA": "人格",
  "Different social behavior": "不同的社交行为",
  "MEMORY": "记忆",
  "Independent conversation history": "独立的对话历史",
  "KNOWLEDGE": "知识",
  "Role-authorized information only": "仅拥有角色允许的信息",
  "AGENT EVENT · ROUND 02": "智能体事件 · 第 02 回合",
  "Sable revised suspicion of Bram": "Sable 调整了对 Bram 的怀疑",
  "WHAT MAKES IT AGENTIC": "为什么它是真正的智能体系统",
  "A system you can play.": "一个可以参与，",
  "And inspect.": "也可以观察的系统。",
  "Incomplete information": "不完整的信息",
  "Every mind sees a different version of the same conversation. Secret roles and private evidence change what each agent believes.": "每个智能体看到的对话版本都不同。秘密身份和私有证据会改变它们的判断。",
  "PRIVATE CONTEXT": "私有上下文",
  "Decisions through tools": "通过工具执行决策",
  "Agents do not merely produce dialogue. They investigate, protect, accuse, vote, and deceive through identity-bound MCP tools.": "智能体不只生成对话，还会通过绑定身份的 MCP 工具调查、保护、指控和投票。",
  "VALIDATED ACTIONS": "经过验证的行动",
  "You are inside the graph": "你就在工作流之中",
  "When your turn arrives, LangGraph genuinely suspends. The world waits until you speak, act, or cast your vote.": "轮到你时，LangGraph 会真正暂停。系统会等待你发言、行动或投票后再继续。",
  "HUMAN INTERRUPT": "人类中断",
  "ONE ROUND · MANY MINDS": "一个回合 · 多个智能体",
  "The night changes": "夜晚改变了",
  "what everyone knows.": "每个人所知道的事实。",
  "Then the council must decide what to believe.": "然后，议会必须判断应该相信什么。",
  "Night": "夜晚",
  "Private agents investigate, protect, and hunt.": "智能体秘密调查、保护与猎杀。",
  "Dawn": "黎明",
  "The shared world resolves what happened in secret.": "共享世界结算夜间发生的秘密行动。",
  "Council": "议会",
  "Seven perspectives collide in one public conversation.": "七种视角在公开讨论中发生碰撞。",
  "Vote": "投票",
  "Human and AI choices cross the same rule boundary.": "人类与 AI 的选择经过相同的规则验证。",
  "THE COUNCIL IS WAITING": "议会正在等待",
  "Do not just watch": "不要只观察",
  "agents work.": "智能体工作。",
  "Sit among them. Listen carefully. Decide whom you believe.": "坐在它们中间，仔细聆听，并决定你愿意相信谁。",
  "An open multi-agent learning experience built with LangGraph and MCP.": "一个使用 LangGraph 与 MCP 构建的开源多智能体学习体验。",
  "Configure agents": "配置智能体",
  "Share demo": "分享演示",
  "Connect": "联系作者",
};

export function LandingText({ text }: { text: string }) {
  const { language } = usePreferences();
  return <>{language === "zh" ? (CHINESE[text] ?? text) : text}</>;
}

export function LandingLanguageSwitch() {
  const { language, setLanguage } = usePreferences();

  return (
    <button
      className="landing-language-switch"
      type="button"
      onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
      aria-label={language === "zh" ? "Switch to English" : "切换到简体中文"}
    >
      {language === "zh" ? "EN" : "中文"}
    </button>
  );
}
