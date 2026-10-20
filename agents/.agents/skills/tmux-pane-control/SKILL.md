---
name: tmux-pane-control
description: Inspect or interact with another tmux pane in the current window. Use when the user asks to read a pane or explicitly send text or keys to it.
compatibility: Requires tmux and a session with TMUX_PANE set.
disable-model-invocation: true
hide: true
metadata:
  opencode/autoinvoke: "false"
---

# Tmux Pane Control

Use `scripts/tmux-pane`; it only permits panes in the current window and rejects the agent's own pane.

```bash
scripts/tmux-pane list
scripts/tmux-pane capture <pane> [start-line]
scripts/tmux-pane send <pane> <literal-text>
scripts/tmux-pane key <pane> <tmux-key>...
```

`send` types literal text without Enter; use `key <pane> Enter` only when the user explicitly requests submission.

## Rules

- `list` and `capture` are allowed; sending text or keys requires an explicit current user request.
- Capture before acting; one input action at a time, then capture again to confirm the program state.
- Never guess at TUI menus, alternate-screen programs, password prompts, confirmation dialogs, or destructive actions — ask instead.
- No multi-step command sequences into interactive programs; send the smallest requested input and wait.
- Do not create, close, resize, select, or otherwise manage panes or windows.