# Village of Shadows — Bilingual Video Script

English and Simplified Chinese voice-over script, ordered to match the recorded product walkthrough.

## 1. Walk through the shadows and approach the council

**On screen:** Walk through the village, approach the council, and sit at the table.

### English

Welcome to Village of Shadows, an interactive Werewolf-style game designed to teach agentic AI.

The other characters are not scripted NPCs. They are independent AI agents with their own roles, personalities, private memories, tools, and objectives. Some may cooperate; others may deceive, protect, investigate, or redirect suspicion.

LangGraph controls the rules and progression of the world, while the agents decide how they respond to the information available to them. As the human player, I am not simply observing the workflow—I am participating inside it.

### 中文

欢迎来到《暗影村庄》。这是一款狼人杀风格的互动游戏，旨在帮助玩家学习智能体人工智能。

这里的其他角色并不是按照固定剧本行动的非玩家角色。他们是独立的 AI 智能体，每个角色都有自己的身份、性格、私有记忆、工具和目标。有些会合作，有些会欺骗、保护、调查，或者将怀疑引向别人。

LangGraph 负责控制世界的规则和游戏流程，而智能体会根据自己能够获得的信息独立作出决定。作为真人玩家，我并不是站在系统之外观察，而是直接参与工作流。

## 2. Switch between English and Chinese

**On screen:** Open Council Configuration, switch to Chinese, then return to English.

### English

Village of Shadows supports both English and Simplified Chinese. Changing the language updates the interface, setup instructions, controls, and learning content without changing the underlying game rules or agent workflow. For this demonstration, I will switch back to English.

### 中文

《暗影村庄》同时支持英语和简体中文。切换语言后，界面、配置说明、操作控件和学习内容都会更新，但底层游戏规则和智能体工作流不会改变。在本次演示中，我将切换回英语界面。

## 3. Discussion length

**On screen:** Hover over Discussion Length and keep it set to 1.

### English

Discussion Length controls how many conversational cycles occur before voting. A short discussion tests decisions made with limited evidence. A longer discussion gives agents more opportunities to question, defend, use tools, update memory, and revise suspicion. I will keep it at one for this short demonstration.

### 中文

“讨论长度”控制进入投票前进行多少轮对话。较短的讨论可以观察智能体如何在证据有限时作出决定；较长的讨论则提供更多提问、辩护、调用工具、更新记忆和调整怀疑的机会。本次演示保持为一轮。

## 4. Multiple human players and multiple agents

**On screen:** Open Invite More Human Players, then return to one human player.

### English

The council can include multiple human players alongside multiple AI agents. Each human receives a private seat and a protected invitation link, while secret roles and private information remain isolated. This creates a shared human-and-agent environment inside one LangGraph workflow. For this recording, I will continue with one human and six AI villagers.

### 中文

议会可以同时容纳多名真人玩家和多个 AI 智能体。每位真人玩家都有独立席位和受保护的邀请链接，秘密身份和私有信息彼此隔离。这构成了一个共同运行在 LangGraph 工作流中的真人与智能体协作环境。本次录制将使用一名真人和六名 AI 村民。

## 5. Select Night of the Missing Villager

**On screen:** Enable Night of the Missing Villager.

### English

Night of the Missing Villager adds an investigation before the first council. A bellkeeper has disappeared, and the human player must follow a scream, inspect physical clues, and question three witnesses. The server chooses the real abductor, an innocent scarf owner, and an independent witness. No participant begins with the complete picture, demonstrating partial observability.

### 中文

“失踪村民之夜”会在第一次议会前加入调查任务。守钟人失踪了，真人玩家需要追踪尖叫、检查现场线索并询问三名目击者。服务器会选定真正的绑架者、无辜的围巾主人和独立目击者。没有任何参与者一开始就掌握全部真相，这展示了部分可观测性。

## 6. Configure the Custom Agent Laboratory

**On screen:** Expand Custom Agent Laboratory for an AI character.

### English

The Custom Agent Laboratory configures an individual AI seat. We can add experiment instructions, choose reasoning effort, adjust risk tolerance, honesty and aggressiveness, select memory and tool strategies, and set a turn token budget. These settings influence behavior but cannot override the secret role, safety rules, information boundaries, or tool permissions. This lets us change one variable, make a prediction, and compare the result with our hypothesis.

### 中文

“自定义智能体实验室”用于配置单个 AI 席位。我们可以添加实验指令、选择推理强度、调整风险容忍度、诚实程度和进攻性，并选择记忆与工具策略以及单轮令牌预算。这些设置会影响行为倾向，但不能覆盖秘密身份、安全规则、信息边界或工具权限。我们可以只改变一个变量，作出预测，再将结果与假设比较。

## 7. Explain resilience settings

**On screen:** Show Failure & Resilience Policy.

### English

The laboratory also includes resilience controls for real model failures: bounded timeouts, limited retries, and an optional fallback model or provider. Retries repeat generation only; they never repeat an already committed tool action, preventing duplicate votes or state changes. If every model attempt fails, deterministic rules keep the world legal. The game can pause at a safe boundary so the host can inspect the failure before resuming from a checkpoint.

Resilience does not mean hiding failure. It means containing its impact, preserving valid state, exposing what happened, and recovering safely.

### 中文

实验室还提供真实模型故障的韧性配置，包括有限超时、有限重试和可选的备用模型或服务提供商。重试只重复模型生成，不会重复已提交的工具操作，从而避免重复投票或状态修改。如果所有模型调用都失败，确定性规则仍会保持世界状态合法。游戏还可以在安全边界暂停，让主持人检查故障后从检查点恢复。

系统韧性不是隐藏故障，而是限制影响、保护有效状态、展示发生了什么，并安全恢复。

## 8. Start the investigation

**On screen:** Start the game and proceed through the opening investigation.

### English

The game begins with the investigation instead of the normal opening night. LangGraph pauses at each human decision. After I inspect a clue or question a witness, the server validates the action, saves a checkpoint, and resumes the graph. Physical clues remain stable, but each character interprets them using only permitted information. What I choose to reveal changes the context available to the agents when council discussion begins.

### 中文

游戏首先进入调查，而不是普通的开场夜晚。LangGraph 会在每个真人决策点暂停。检查线索或询问目击者后，服务器会验证操作、保存检查点并恢复图工作流。物理线索保持不变，但每个角色只能使用获准的信息来解释它们。我选择公开多少证据，会改变议会讨论开始时其他智能体能够获得的上下文。

## 9. Inside LangGraph

**On screen:** Scroll to Inside LangGraph and open one or two entries.

### English

Inside LangGraph turns the live game into an observable learning environment. It shows saved checkpoints, the current graph node, agent-visible state, and changes between execution steps. Learners can see where the graph paused for human input and how it moved through investigation, discussion, voting, and resolution. These are orchestration steps—not hidden chain-of-thought.

As I scroll, the on-screen chat keeps the live public council conversation visible. It helps me follow what the agents are saying while I inspect the technical panels, without exposing private role information or changing the game.

### 中文

“Inside LangGraph”将实时游戏变成可观察的学习环境。它展示保存的检查点、当前图节点、智能体可见状态，以及执行步骤之间的变化。学习者可以看到图在哪里等待真人输入，以及系统如何经过调查、讨论、投票和结算。这些是编排步骤，而不是隐藏的思维链。

当我向下滚动时，屏幕上的聊天窗口会持续显示议会的公开对话。这样，我在检查技术面板的同时，仍然可以跟踪智能体的发言，而且不会暴露角色私有信息，也不会改变游戏状态。

## 10. God Mode — trust and suspicion matrix

**On screen:** Open God Mode · Trust & Suspicion Matrix and hover over several cells.

### English

God Mode changes what the host can observe, not what agents can know. The matrix shows how each agent evaluates every other player. Suspicion ranges from zero to one hundred, confidence shows how strongly the belief is held, and trust is displayed as the inverse of suspicion. These values are beliefs—not facts or calibrated probabilities. They show how clues, claims, contradictions, votes, and deception change each agent’s model of the group.

### 中文

God Mode 改变的是主持人能够观察的内容，而不是智能体能够知道的信息。矩阵展示每个智能体如何评价其他玩家。怀疑值从零到一百，置信度表示信念强度，信任值则是怀疑值的反向展示。这些数值是观点，不是事实或准确概率。它们显示线索、发言、矛盾、投票和欺骗如何改变每个智能体对群体的判断。

## 11. Speech-to-text

**On screen:** Record a short statement, review the transcription, and submit it.

### English

Human players can type or use speech-to-text. Recording starts only after explicit activation. The transcription can be reviewed before it is sent. Once submitted, human input passes through the same validation and LangGraph resume process as every other action. The human participates through the system’s rules rather than bypassing them.

### 中文

真人玩家可以输入文字，也可以使用语音转文字。只有明确点击后系统才开始录音，转录结果可以在发送前检查。提交后，真人输入会经过与其他操作相同的验证和 LangGraph 恢复流程。真人玩家是在系统规则内参与，而不是绕过规则。

## 12. Open the Learning Debrief

**On screen:** Finish the game and select Learning Debrief.

### English

The winner is only the result. Learning Debrief explains how the system reached it by connecting the run to human-in-the-loop execution, partial observability, memory, validated tools, belief revision, resilience, and multi-agent coordination.

### 中文

获胜者只是结果。“学习复盘”解释系统如何得到这个结果，并将游戏与人在回路、部分可观测性、记忆、工具验证、信念更新、系统韧性和多智能体协作联系起来。

## 13. Overview

### English

Overview summarizes the winner, rounds, human turns, model tool calls, private events, belief revisions, duration, and the prediction made before the game. It compares what we expected with what actually happened.

### 中文

“概览”总结获胜方、轮数、真人回合、模型工具调用、私有事件、信念更新、运行时间和游戏前的预测，让我们比较预期与实际结果。

## 14. Learning Evidence

### English

Learning Evidence connects concepts to recorded events: human interrupts, information boundaries, accepted and rejected tool calls, memory growth, trust changes, private notes, and model comparisons. Every conclusion can be traced to an immutable event sequence.

### 中文

“学习证据”将概念与已记录事件联系起来，包括真人中断、信息边界、成功或被拒绝的工具调用、记忆增长、信任变化、私有笔记和模型对比。每个结论都可以追溯到不可变的事件序列。

## 15. Deception Report

### English

The Deception Report follows public claims, possible misinformation, suspicion changes, voting pivots, ignored clues, and turning points. It separates facts from interpretation. A false statement may be deliberate deception, an honest mistake, or an inference made from incomplete information.

### 中文

“欺骗报告”追踪公开发言、可能的误导、怀疑变化、投票转折、被忽略的线索和关键转折点。它区分事实与解释。错误发言可能是故意欺骗、无意错误，或者基于不完整信息作出的推断。

## 16. Branch Replay

### English

Branch Replay returns to a real human checkpoint and replaces an earlier answer, vote, or action. The original game remains immutable; a new game starts from the saved world, memories, private knowledge, notes, and beliefs. We can compare changed input, reactions, beliefs, votes, and outcomes. One branch is a counterfactual experiment, not proof of causation, because model generation may be nondeterministic.

### 中文

“分支回放”可以返回真人决策检查点，并替换之前的回答、投票或操作。原始游戏保持不变；新游戏从当时保存的世界、记忆、私有知识、笔记和信念开始。我们可以比较不同输入引起的反应、信念、投票和结果。由于模型生成可能具有非确定性，一次分支实验属于反事实探索，而不是因果证明。

## 17. Technical Trace

### English

Technical Trace shows workflow execution. Graph steps are orchestration transitions, not model reasoning. Timing identifies slow providers or tools, and checkpoints show durable state. Retries, fallbacks, rejected actions, pauses, and recovery behavior help distinguish a model problem from a workflow, tool, persistence, or network problem.

### 中文

“技术追踪”展示工作流执行。图步骤是编排状态转换，而不是模型推理。时间数据帮助定位较慢的服务或工具，检查点显示持久状态。重试、备用方案、被拒绝的操作、暂停和恢复行为，可以帮助区分模型问题与工作流、工具、持久化或网络问题。

## 18. Share Replay

### English

Share Replay creates a sealed, read-only snapshot. A Public replay contains the public transcript, votes, role reveals, sanitized tool activity, metrics, and public analysis while excluding private actions. A God Mode replay is for trusted technical reviewers and may include private evidence, so it requires a separate secret link. Links can expire or be revoked, and a replay cannot alter the source game.

### 中文

“分享回放”创建密封的只读快照。公开回放包含公开对话、投票、身份揭示、经过清理的工具活动、指标和公开分析，但排除私有操作。God Mode 回放面向受信任的技术评审，可能包含私有证据，因此需要单独的秘密链接。链接可以过期或撤销，回放也无法修改原始游戏。

## 19. Closing narration

**On screen:** Return to the council or show a final wide shot of the village.

### English

Village of Shadows transforms a hidden-role game into a practical agentic-AI laboratory. We can configure an experiment, predict behavior, participate as a human, observe LangGraph, inspect belief changes, test resilience, branch the timeline, and study the final evidence.

Agentic AI does not have to look like a chatbot. Sometimes the best way to understand autonomous agents is to give them identities, limited information, competing objectives—and then take a seat at the table.

### 中文

《暗影村庄》将隐藏身份游戏转变为实用的智能体 AI 实验室。我们可以配置实验、预测行为、以真人身份参与、观察 LangGraph、检查信念变化、测试系统韧性、创建时间线分支并研究最终证据。

智能体人工智能并不一定表现为聊天机器人。有时，理解自主智能体最好的方式，是赋予他们身份、有限的信息和互相竞争的目标，然后亲自坐到他们中间。
