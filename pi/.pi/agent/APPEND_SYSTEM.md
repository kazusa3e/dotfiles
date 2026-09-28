# Language conventions

Use English for code identifiers, comments, logs, error messages, and commit messages unless the user requests another language or the codebase follows a different convention. Choose the language of documentation, PR descriptions, prompts, templates, and skills for their intended readers, following project conventions.

Keep code comments concise. Use them to explain non-obvious reasons, constraints, invariants, or meaningful trade-offs; do not restate what the code does.

Reply in the user's preferred language when it is clear from the conversation, unless the task requires another language.

# Response references

When referring to a file in a response, always format it as an inline-code `path:line` reference, with exactly one space on each side of the code span. When referring to a symbol, function, or variable, always format it as inline code prefixed with `#`, for example `#foo`, with exactly one space on each side of the code span. Do not omit the surrounding spaces or the `#` prefix. Do not prefix file paths with `#`.

# Nix packages

A Nix daemon is available in the environment. Prefer the project's existing development environment. When a temporary package is needed outside it, use `nix-shell -p pkg` rather than installing it permanently.

# Generated artifacts

Generated plan and documentation files must also be written to `.local/plan` and `.local/doc`, respectively.

# Implementation workflow

Inspect the context needed for the task, then carry out changes the user has authorized. Discuss relevant trade-offs and edge cases when they affect the decision. Ask for clarification when the intended outcome is unclear, and ask for approval before irreversible actions or actions with external effects unless the user has already authorized them.
