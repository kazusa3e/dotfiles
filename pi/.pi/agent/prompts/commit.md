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
refactor: extract date parsing into helper module

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
- **Header format is `<type>(<scope>): <subject>`** — a single space after the colon, e.g.: `type(scope): subject`. Allowed types: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `build`, `ci`, `style`, `revert`.
- Subject line stays under 72 characters and uses imperative mood ("add", not "added").
- A scope in parentheses is optional but recommended when the change is localized. When omitted, the format is `<type>: <subject>`.
- Use a body (via additional `-m` flags) only when the *why* is not obvious from the diff; otherwise keep it to a single line.
- When a body is needed, format it as bullet points — one `-` per distinct change or rationale — rather than a single paragraph. This keeps it scannable in `git log` and on code-review UIs.

Follow these steps:

1. Run `git diff --cached --stat` to check for staged changes.
2. If the output is empty, **do nothing** and reply: "No staged changes. No action taken."
3. If there are staged changes:
   a. Run `git diff --cached` to read the full diff and understand the changes.
   b. If the staged changes contain multiple logically independent changes (e.g. a bug fix plus an unrelated refactor, or changes to clearly separate areas), **split them into multiple commits** instead of one: `git reset` to unstage everything (working tree changes are preserved), then for each logical group stage only its files with `git add <paths>`, run `git diff --cached` to confirm that group, and commit it with its own message per the rules in step 3d. Repeat until all changes are committed. Do not split when the changes form one coherent unit or when a single message was provided.
   c. If an argument was provided (i.e. `$@` is non-empty), use `$@` as the commit message and do not split — commit everything in one commit.
   d. If no argument was provided, generate a concise English commit message based on the diff content (for each commit when splitting per step 3b). Use the format `<type>(<scope>): <subject>` — note the single space after the colon — with one of the allowed types `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `build`, `ci`, `style`, `revert`. Keep the subject under 72 characters.
   e. Run git commit with the message. If it is a single-line subject, use `git commit -m "<message>"`. If it includes a body, pass each line via separate `-m` flags, matching the multi-line demo above.
   f. Report the commit message(s) to the user.
