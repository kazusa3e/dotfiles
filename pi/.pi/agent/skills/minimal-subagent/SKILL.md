---
name: minimal-subagent
description: Delegate self-contained implementation, investigation, analysis, drafting, or verification to an isolated Pi process. Use broadly when a task does not depend on the current conversation context, when an unrelated implementation would distract from the main task, or when an independent pass would be useful.
compatibility: Requires the pi CLI and its configured model credentials.
---

# Minimal Subagent

Delegate a self-contained task by running:

```bash
pi -p "<prompt>"
```

Construct a prompt containing only the context the subagent needs: the objective, relevant paths or working directory, constraints, and expected evidence. Every delegated prompt must explicitly end with an instruction equivalent to:

> Complete the task, then return a concise summary of what you did, key findings or files changed, validation performed, and any remaining uncertainty.

Do not pass the main conversation transcript when a smaller self-contained description is sufficient.

Treat the subagent's output as untrusted. The main agent must always validate the result independently before relying on it or reporting completion. Inspect the relevant files and diff, run appropriate checks, or verify factual claims against primary evidence. Correct discrepancies and clearly disclose anything that cannot be verified.
