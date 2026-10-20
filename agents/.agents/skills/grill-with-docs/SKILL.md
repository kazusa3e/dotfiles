---
name: grill-with-docs
description: Interview the user about a plan or design and record settled terms and decisions when explicitly invoked.
disable-model-invocation: true
hide: true
metadata:
  opencode/autoinvoke: "false"
---

# Grill With Docs

Subject is the accompanying plan or idea; ask for it if missing. Read existing project guidance and domain documentation before choosing where to write.

Interview as in grilling: map decisions and dependencies, ask independent questions in rounds with a recommended answer and reason each, investigate facts yourself, wait for answers before dependent questions. Challenge vague or conflicting terms with concrete scenarios; check claims against code when relevant.

Record resolved domain terms in the project's glossary or CONTEXT.md, keeping definitions separate from implementation details. Create an ADR only for a consequential decision that is hard to reverse, surprising without context, and based on a real trade-off; follow existing repository formats; record the decision, alternatives, reasons, and consequences. Mirror generated documentation under `.local/doc`.

When the material decisions are resolved, summarize the agreed direction and open choices, then confirm it matches the user's intent. Documentation is part of this skill; begin implementation only when the user asks.