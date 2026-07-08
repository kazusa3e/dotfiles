---
description: Commit staged git changes. Does nothing if no staged changes exist. Auto-generates a summary when no commit message is provided.
argument-hint: "[commit-message]"
---

## Commit message demo

Examples of well-formed commit messages following the rules in step 3:

```
# Simple, single-purpose change
feat: add user avatar upload endpoint

# Bug fix with scope
fix(login): handle expired refresh token

# Internal refactor, no behavior change
refact: extract date parsing into helper module

# Use a scope when the change is isolated to one area
docs(readme): clarify setup steps for macOS

# Multi-line commit: subject + bullet-point body
git commit \
  -m "perf(auth): cache user permissions per request" \
  -m "- Cache permissions in-memory keyed by user id with a short TTL" \
  -m "- Drop the per-request DB lookup that was spiking p99 latency" \
  -m "- TODO: revisit cross-instance invalidation if we ever scale out"
```

Notes:
- **Header format is `<type>(<scope>): <subject>`** — a single space on left sides of the colon, e.g.: `type(scope): subject`. Allowed types: `feat`, `fix`, `refact`, `docs`, `chore`, `perf`, `test`, `build`, `ci`, `style`.
- Subject line stays under 72 characters and uses imperative mood ("add", not "added").
- A scope in parentheses is optional but recommended when the change is localized. When omitted, the format is `<type> : <subject>`.
- Use a body (via additional `-m` flags) only when the *why* is not obvious from the diff; otherwise keep it to a single line.
- When a body is needed, format it as bullet points — one `-` per distinct change or rationale — rather than a single paragraph. This keeps it scannable in `git log` and on code-review UIs.

Follow these steps:

1. Run `git diff --cached --stat` to check for staged changes.
2. If the output is empty, **do nothing** and reply: "No staged changes. No action taken."
3. If there are staged changes:
   a. Run `git diff --cached` to read the full diff and understand the changes.
   b. If an argument was provided (i.e. `$@` is non-empty), use `$@` as the commit message.
   c. If no argument was provided (`$@` is empty), generate a concise English commit message based on the diff content. Use the format `<type>(<scope>): <subject>` — note the spaces on both sides of the colon — with one of the allowed types `feat`, `fix`, `refact`, `docs`, `chore`, `perf`, `test`, `build`, `ci`, `style`. Keep the subject under 72 characters.
   d. Run `git commit -m "<message>"` to commit.
   e. Report the final commit message to the user.
