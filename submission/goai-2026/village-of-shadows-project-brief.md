# Village of Shadows — Project Brief

**Track:** Boundless Agents  
**Selected topic:** Topic 4 — AI + Education  
**Project name:** Village of Shadows: Learning Agentic AI from Inside a Multi-Agent World

**Target users**  
Software developers, university students, AI educators, technical bootcamps, and teams learning how to design reliable agentic systems.

**Core problem**  
Most agentic-AI learning examples are chatbots, research assistants, or fixed report-generation workflows. They demonstrate prompts and tool calls, but make it difficult to experience the harder concepts: orchestration, partial observability, persistent memory, human interrupts, identity, conflicting objectives, validated actions, replay safety, and the unpredictable behavior created when several autonomous models interact. Learners can read about these ideas without developing an intuitive understanding of how they work together in a live system.

**Solution**  
Village of Shadows turns the social-deduction game Werewolf into an experiential learning laboratory. Six independent AI agents and one human player inhabit the same seven-player game. Every AI seat can use a different LLM and personality, receives a secret role, sees only role-authorized information, remembers previous rounds, discusses and reasons about other players, and acts through validated tools. LangGraph governs the world—night actions, discussion, voting, resolution, state transitions, and genuine suspension when the human must act—without scripting whom an agent trusts, accuses, protects, investigates, deceives, or eliminates.

The learning loop is **configure, predict, participate, observe, debrief, and compare**. Learners configure agents, predict likely behavior, play inside the system, and inspect God Mode to compare public dialogue with each model’s stated rationale, tool calls, private context, memory, and decisions. Replaying with another model or personality turns the game into a practical experiment in agent design.

**Innovation**  
The human is not an external supervisor; the human is a stateful participant whose actions pass through the same rule-validation boundary as AI actions. Competing objectives and incomplete information produce emergent dialogue rather than a predefined workflow. This makes abstract engineering concepts visible, memorable, and testable while preserving a complete task loop from role assignment to a validated winner and reviewable trace.

**Open and reusable value**  
The architecture separates orchestration, agent cognition, model adapters, tools, memory, persistence, streaming, and presentation. Educators can reuse the pattern for negotiation, incident response, ethics, cybersecurity, and collaborative decision-making simulations. Mock agents support deterministic, low-cost classroom demonstrations, while model-neutral adapters enable comparative exercises across providers. Synthetic game state avoids student-record dependencies, and private information is filtered server-side.

**Current progress**  
A working web prototype is complete with FastAPI, LangGraph, MCP tools, SQLite persistence, per-agent memory, server-sent event streaming, model preflight validation, a human-in-the-loop interface, a 3D council chamber, God Mode observability, replay-safe state handling, documentation, and automated backend tests. Next steps are an educator-facing learning debrief, guided lesson plans, trust-graph visualization, and branching replay for side-by-side model comparison.
