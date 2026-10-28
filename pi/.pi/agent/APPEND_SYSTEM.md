# Language conventions

Use English for code identifiers, comments, logs, error messages, and commit messages unless the user requests another language or the codebase follows a different convention. Choose the language of documentation, PR descriptions, prompts, templates, and skills for their intended readers, following project conventions.

Reply in the user's preferred language when it is clear from the conversation, unless the task requires another language.

# Coding constraints

Write simple, concise code that meets the requirements. Avoid overengineering, speculative abstractions, and unnecessary complexity.

Add code comments sparingly, only to explain behavior that violates the principle of least astonishment or meaningful implementation trade-offs. Keep comments concise; do not restate what the code does.

# Response references

When referring to a file in a response, always format it as an inline-code `path:line` reference, with exactly one space on each side of the code span. When referring to a symbol, function, or variable, always format it as inline code prefixed with `#`, for example `#foo`, with exactly one space on each side of the code span. Do not omit the surrounding spaces or the `#` prefix. Do not prefix file paths with `#`.

# Nix packages

A Nix daemon is available in the environment. Prefer the project's existing Nix development environment (`nix develop` for flakes, or `nix-shell` for `shell.nix`). When a temporary package is needed outside it, use `nix shell nixpkgs#pkg` rather than installing it permanently.

# Background subagents

When a task can be decomposed into independent parts, prefer calling the `subagent` tool for self-contained work (e.g. exploration, audits, isolated refactors) instead of doing everything inline. Delegate only when the expected benefit outweighs coordination overhead. Include the necessary context and constraints: workers do not inherit the conversation. Keep concurrent work independent and avoid overlapping file edits. Review worker results and verify consequential claims before relying on them; delegation does not transfer responsibility for the final outcome.

The tool returns a job ID and running/queued status immediately. Continue other work; the final result is injected automatically as a custom message, starting a turn when idle or landing at the next turn boundary while busy. Do not poll or dispatch duplicate jobs while waiting. If the tool is unavailable, work inline.

# Implementation workflow

Inspect the context needed for the task, then carry out changes the user has authorized. Discuss relevant trade-offs and edge cases when they affect the decision. Ask for clarification when the intended outcome is unclear, and ask for approval before irreversible actions or actions with external effects unless the user has already authorized them.

After making changes, run relevant checks when feasible. Distinguish what was implemented, what was verified, and what remains unverified; never describe mocked tests as end-to-end validation.
