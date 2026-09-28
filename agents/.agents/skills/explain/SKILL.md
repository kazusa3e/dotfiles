---
name: explain
description: Explain a concept or question clearly when explicitly invoked.
disable-model-invocation: true
hide: true
metadata:
  opencode/autoinvoke: "false"
---

# Explain

Use the user's accompanying request as the topic. If none was supplied, ask what they want explained. Ask one concise clarifying question when the topic is genuinely ambiguous.

Match the user's language and level while retaining useful canonical terms. Give a clear, self-contained explanation that covers:

- Concept: what it means, its distinguishing properties, and likely points of confusion.
- Background: the problem it addresses and relevant historical context.
- Trade-offs: concrete situations where it helps or hurts, and when a simpler approach is preferable.

Include only sections that add useful information; use headings when they make the answer easier to scan. Add an example or further reading only when it materially helps.

Research recent, niche, uncertain, or specific historical claims, and cite sources used. End when the explanation is complete.
