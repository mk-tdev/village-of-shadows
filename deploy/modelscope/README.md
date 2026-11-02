---
license: mit
sdk: static
app_file: index.html
---

# Village of Shadows · 暗影村庄

A playable multi-agent AI learning lab built around social deduction.

Human players join AI agents with distinct roles, private context, memory, and tools. Learn by predicting decisions, examining evidence, inspecting LangGraph checkpoints and tool calls, and comparing outcomes through replay and branching.

暗影村庄是一款以社交推理游戏为载体的多智能体 AI 学习实验室。通过预测决策、分析线索、查看状态和工具调用，以及回放与分支比较，学习私有上下文、部分可观测性、多智能体协作与人机协作。

## Try it

- [Play the game](https://village-of-shadows.vercel.app/)
- [Source code and setup](https://github.com/mk-tdev/village-of-shadows)
- [How to play](https://village-of-shadows.vercel.app/how-to-play)

For a short demo, configure one discussion round. Use the host's God Mode to inspect agent context, tool calls, and saved LangGraph checkpoints. Mock mode demonstrates orchestration without live model reasoning. The introductory Missing Villager accounts are scripted; live council agents use the selected models.

## Deployment architecture

This is a static ModelScope showcase embedding the existing live Next.js game on Vercel. The backend and persistent database remain on the existing deployment. It is not a standalone copy of the full application. No API keys or game credentials are included in this repository. Browser or parent-frame permissions may restrict microphone access; use the direct game link for voice interaction when necessary.

Upload the contents of this directory to the ModelScope Studio, choose **Static**, and select `index.html` as the entry file. This deployment needs no GPU or paid compute.

Application source: MIT license. Third-party assets retain their respective licenses in the application repository.
