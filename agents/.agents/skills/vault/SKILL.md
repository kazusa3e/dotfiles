---
name: vault
description: "Access the user's personal note vault to retrieve past records, preferences, and decisions, or manage personal tasks, daily planning, reviews, and persistent notes. Use for vault-backed memory and task management, not ordinary coding task breakdowns."
disable-model-invocation: false
metadata:
  opencode/autoinvoke: "true"
---

# Vault

Use the note vault as the source of truth for persistent personal records.

- Resolve the vault root from the WIKI_DIR environment variable; never hardcode a device-specific path. Use the resolved path for file operations rather than assuming the current working directory is the vault.
- Before the first vault access in a session, read the root AGENTS.md in full and follow its rules. Read it again if those rules change.
- Search and read only notes relevant to the request; do not load the entire vault.
- A lookup does not authorize a write. Persist or modify records only when the user requests it, subject to the vault rules.
- If WIKI_DIR is unset or empty, the directory is inaccessible, or AGENTS.md cannot be read, report the blocker. Do not guess a path or create a replacement memory store.
