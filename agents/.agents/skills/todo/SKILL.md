---
name: todo
description: "Track long-running goals and milestone progress across conversations using available context. Use for work expected to span sessions or when the user requests progress tracking, not merely because a task has multiple steps."
disable-model-invocation: false
metadata:
  opencode/autoinvoke: "true"
---

# Todo

Maintain progress around a long-running goal, not a fresh checklist for each reply.

- Track the goal and milestones; distinguish milestone progress from immediate actions. Keep progress in the conversation, without creating tracking files unless asked.
- When resuming, recover the relevant goal and progress from available history or a handoff before planning new work. If context is missing, ask for a brief recap; never invent prior progress.
- Use ⏳ pending, 🔄 in progress, ✅ completed, 🚧 blocked, and ➖ cancelled. Keep at most one milestone in progress; mark completion only after verification.
- Update when milestones, scope, decisions, or blockers change, not after every operation. Completing this turn's actions does not complete the overall goal.
- Report meaningful changes briefly in the user's language. Show the full checklist only when asked or at a handoff.
- When pausing or handing off, summarize the goal, verified progress, remaining work, blockers, and next action so another session can continue.
- Stop tracking when asked. Do not carry progress into unrelated tasks.
