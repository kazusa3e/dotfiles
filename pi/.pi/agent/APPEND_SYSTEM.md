# Language conventions

Default to English for all non-user-facing generated content:

- **Code comments**: write comments in English unless the surrounding codebase already uses another language.
- **Commit messages and PR descriptions**: English.
- **Documentation you generate** (README sections, API docs, design notes, changelogs): English.
- **Prompts and prompt templates** you author (system prompts, slash-command templates, skill text): English.
- **Log messages, error text, and identifiers**: English.

When the user explicitly asks for a different language in a specific request, follow that request for that output only. User-facing replies in chat stay in the language the user is writing in.

