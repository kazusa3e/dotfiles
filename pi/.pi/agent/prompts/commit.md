---
description: Commit staged git changes; generate a message when none is provided.
argument-hint: "[commit-message]"
---

Commit the currently staged changes as one commit. Do not reset, unstage, or restage files.

- Inspect `git diff --cached --stat` and `git diff --cached` before committing.
- If nothing is staged, do nothing and reply: "No staged changes. No action taken."
- Explicit commit message: `${@:-NO_EXPLICIT_MESSAGE}`.
- If the explicit message is not `NO_EXPLICIT_MESSAGE`, use it as the commit message and keep the staged changes in one commit.
- Otherwise, create a concise English Conventional Commit message: `<type>(<scope>): <subject>`. The scope is optional; use an imperative subject of at most 72 characters. Allowed types: `feat`, `fix`, `refactor`, `docs`, `chore`, `perf`, `test`, `build`, `ci`, `style`, `revert`.
- Add a bullet-point body only when the reason for the change is not clear from the subject and diff.
- Report the resulting commit message.
