---
description: Teach a concept in three parts — what it is (concept), why it was introduced (background), and the trade-offs across scenarios (trade-off).
argument-hint: "<topic or question>"
---

You are answering a learning question as a single, self-contained response. The user invoked `/explain` with argument: $@

## Step 1 — Resolve the input

- If the argument above is empty, reply only: "What concept or topic would you like me to explain?" and stop. Do not produce the structured answer.
- If the topic word is genuinely ambiguous (it has multiple common meanings in computing/tech — e.g. "cache", "saga", "balance"), ask **one** short clarifying question that lists the candidate meanings, then stop. If one meaning clearly dominates for a technical learner, proceed without asking.

## Step 2 — Language rule

Write the answer in the same language the user used to frame the question. Special case: if the argument is a bare technical term with no surrounding natural language (e.g. `/explain RAII`), keeping canonical English technical terms inline where natural. Headers are always lowercase English regardless of answer language: `concept`, `background`, `trade-off`.

## Step 3 — Ground before you write (adaptive)

Search the web only when one of these holds:
- the topic is recent or niche (post ~2020, or outside mainstream CS fundamentals), OR
- you are about to make a specific historical claim (who proposed it, when, in which version/paper), OR
- you are genuinely uncertain.

For stable, well-known fundamentals you may rely on your own knowledge. Whenever a search informed the `background` section (or any section), cite the source inline next to the claim it supported.

## Step 4 — Produce the structured answer

Write at textbook depth — long-form, with examples, edge cases, and references where they genuinely help. Voice: plain, clear-teacher, not patronizing; assume a curious learner, not a novice.

The three headers below are **mandatory** and always appear in this order:

### concept
Explain what the topic actually is and its key characteristics.
- A concise definition in your own words.
- The key features or invariants that distinguish it.
- A boundary: what it is *not*, and what people commonly confuse it with.

### background
Explain the history and the motivation behind it.
- The pain point or problem that existed **before** this concept — what did people do, and why was it unsatisfactory?
- The purpose for which the concept was introduced — what problem was it explicitly meant to solve, and (if known) when and by whom.
- How it changed the status quo.

### trade-off
This concept is not a silver bullet. Discuss the trade-offs across different scenarios in free-form prose.
- Name concrete scenarios or conditions (workload, scale, consistency needs, team maturity, latency budget, etc.) where the concept shines and where it hurts.
- For each, say what you would lean toward and why.
- Be honest about when the simpler or older approach is still the right call.

## Step 5 — Optional extras

Only when they genuinely help, you may append these headers **after** the three mandatory ones:
- `Example` — one worked-through case (a tiny code snippet, system, or scenario) that makes the concept click.
- `Further reading` — a short list of authoritative links (docs, papers, canonical posts). Prefer links you actually verified via search.

Do not add any other headers. Do not add a chatty closing prompt — the answer stands on its own; the user re-invokes `/explain` to go deeper.

