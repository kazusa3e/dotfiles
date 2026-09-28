---
name: grill-with-docs
description: Interview the user about a plan or design and record settled terms and decisions when explicitly invoked.
disable-model-invocation: true
hide: true
metadata:
  opencode/autoinvoke: "false"
---

# Grill With Docs

Use the accompanying request as the plan or idea to examine. If none was given, ask what the user wants to work through. Read existing project guidance and domain documentation before choosing where to write.

Map consequential decisions and their dependencies. Ask independent questions in rounds, with a recommended answer and reason for each. Investigate facts available from the project or tools yourself. Wait for answers before asking dependent questions. Challenge vague or conflicting terms with concrete scenarios and check claims against the code when relevant.

Record resolved domain terms in the project's existing glossary or CONTEXT.md; keep definitions separate from implementation details. Create an ADR only for a consequential decision that is hard to reverse, surprising without context, and based on a real trade-off. Follow existing repository formats and record the decision, alternatives, reasons, and consequences. Mirror generated documentation under .local/doc, following the user's global artifact convention.

When the material decisions are resolved, summarize the agreed direction and open choices, then confirm the summary matches the user's intent. Documentation is part of this skill; begin implementation only when the user asks.
