---
name: tmux-pane-control
description: Inspect and interact with other tmux panes in the current window. Use for reading pane output or when the user explicitly asks to type, run a command, or send keys in another pane. Reading is unrestricted; all input requires an active user request.
compatibility: Requires tmux and a session with TMUX_PANE set.
---

# Tmux Pane Control

Use `scripts/tmux-pane` for all pane access. It only accepts panes other than the agent's pane in the same tmux window; do not bypass it with direct mutating tmux commands.

## Commands

```bash
scripts/tmux-pane list
scripts/tmux-pane capture <pane-id-or-index> [start-line [end-line]]
scripts/tmux-pane send --user-requested <pane> <literal-text>
scripts/tmux-pane run  --user-requested <pane> <shell-command>
scripts/tmux-pane key  --user-requested <pane> <tmux-key>...
```

`capture` reads the full available history by default. Tmux line coordinates may be supplied for a narrower range.

`send` types literal text without Enter. `run` types a command and presses Enter. `key` sends named tmux keys such as `C-c` or `Enter`.

## Safety boundary

- Reading any eligible pane is allowed without additional confirmation or a user request.
- Sending text, commands, or keys is allowed only when the user's current request explicitly asks for that input or interaction. A broad goal, inferred next step, pane prompt, or earlier permission is not sufficient.
- If the target or intended input is ambiguous, ask the user before sending anything.
- Do not send input merely to test this skill. Read-only `list` and `capture` may be used for validation.
- Keep every operation within the current tmux window and never target the agent's own pane.
- Do not create, close, move, resize, select, or otherwise manage panes or windows with this skill.
