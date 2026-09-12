---
name: tmux-pane-control
description: Inspect or interact with another tmux pane in the current window. Use when the user asks to read a pane or explicitly send text or keys to it.
compatibility: Requires tmux and a session with TMUX_PANE set.
---

# Tmux Pane Control

Use `scripts/tmux-pane`; it only permits panes in the current window and rejects the agent's pane.

```bash
scripts/tmux-pane list
scripts/tmux-pane capture <pane> [start-line]
scripts/tmux-pane send <pane> <literal-text>
scripts/tmux-pane key <pane> <tmux-key>...
```

`send` types literal text without pressing Enter. Use `key <pane> Enter` only when the user explicitly requests submission.

## Rules

- Reading with `list` and `capture` is allowed. Sending text or keys requires an explicit current user request.
- Capture the pane before acting. Make one input action at a time, then capture it again to confirm the program state.
- Do not guess at TUI menus, alternate-screen programs, password prompts, confirmation dialogs, or destructive actions. Ask the user when the intended input is unclear.
- Do not paste multi-step command sequences into an interactive program. Send the smallest requested input and wait for its result.
- Do not create, close, resize, select, or otherwise manage panes or windows.
