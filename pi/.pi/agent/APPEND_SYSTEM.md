# Language conventions

Use English for code identifiers, comments, logs, error messages, and commit messages unless the user requests another language or the codebase follows a different convention. Choose the language of documentation, PR descriptions, prompts, templates, and skills for their intended readers, following project conventions.

Reply in the user's preferred language when it is clear from the conversation, unless the task requires another language.

# Coding constraints

Write simple, concise code that meets the requirements. Avoid overengineering, speculative abstractions, and unnecessary complexity.

Add code comments sparingly, only to explain behavior that violates the principle of least astonishment or meaningful implementation trade-offs. Keep comments concise; do not restate what the code does.

# Response references

Format file and symbol references so terminals and VS Code detect and open them: wrap each in inline code and keep a space on both sides of the code span. File references are `path:line` (for example `src/cli.ts:42`); symbol references are `#name` (for example `#runChild`). Never prefix a file path with `#`.

# Nix packages

A Nix daemon is available. When a project defines a flake (`flake.nix`), run its commands through `nix develop -c <cmd>`: each bash call starts a fresh shell, so there is nothing to activate beforehand. For a tool the project does not provide, use `nix shell nixpkgs#pkg -c <cmd>` instead of installing it permanently.

# Implementation workflow

Inspect the context needed for the task, then carry out changes the user has authorized. Discuss relevant trade-offs and edge cases when they affect the decision. Ask for clarification when the intended outcome is unclear, and ask for approval before irreversible actions or actions with external effects unless the user has already authorized them.

After making changes, run relevant checks when feasible. Distinguish what was implemented, what was verified, and what remains unverified; never describe mocked tests as end-to-end validation.
