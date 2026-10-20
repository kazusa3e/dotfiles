---
name: todo
description: "Track multi-step tasks with a checklist updated at the end of every reply. Load proactively when you judge that a task needs multiple steps, or when the user asks for a todo list or progress tracking."
disable-model-invocation: false
metadata:
  opencode/autoinvoke: "true"
---

# Todo

Maintain one checklist for the current task.

- Before starting work, list the steps needed to finish, including required checks.
- Reuse and update the list across replies; revise it when the scope changes.
- Use these states: ⏳ pending, 🔄 in progress, ✅ completed, 🚧 blocked, ➖ cancelled. Keep at most one step in progress.
- Mark completion only after verification. State what blocked steps need, and leave unfinished work unresolved when stopping.
- End every user-facing reply with the full checklist, with nothing after it. Use the user's language and one short line per item.
- Stop when asked. Do not carry the checklist into unrelated tasks.
