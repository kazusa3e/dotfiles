#!/bin/bash
set -euo pipefail

MODE="${1:-}"
INPUT=$(cat)

case "$MODE" in
    stop)
        TRANSCRIPT_PATH=$(echo "$INPUT" | jq -r '.transcript_path // ""')
        TITLE="Claude Code finished"
        BODY=""

        # Extract text from message content (handles both string and array formats)
        extract_text() {
            jq -r 'if .message.content | type == "string" then .message.content
                   else [.message.content[]? | select(.type == "text") | .text] | join(" ")
                   end' 2>/dev/null || echo ""
        }

        if [[ -n "$TRANSCRIPT_PATH" ]] && [[ -f "$TRANSCRIPT_PATH" ]]; then
            # Find last user message that has text content (not just tool results)
            LAST_USER=""
            while IFS= read -r line; do
                text=$(echo "$line" | extract_text)
                [[ -n "$text" ]] && LAST_USER="$text"
            done < <(grep '"role":"user"' "$TRANSCRIPT_PATH" 2>/dev/null)
            if [[ -n "$LAST_USER" ]]; then
                if [[ ${#LAST_USER} -gt 120 ]]; then
                    LAST_USER="${LAST_USER:0:120}..."
                fi
                BODY="Q: $LAST_USER"
            fi

            # Find last assistant message that has text content (not just tool calls)
            LAST_ASSISTANT=""
            while IFS= read -r line; do
                text=$(echo "$line" | extract_text)
                [[ -n "$text" ]] && LAST_ASSISTANT="$text"
            done < <(grep '"role":"assistant"' "$TRANSCRIPT_PATH" 2>/dev/null)
            if [[ -n "$LAST_ASSISTANT" ]]; then
                if [[ ${#LAST_ASSISTANT} -gt 150 ]]; then
                    LAST_ASSISTANT="${LAST_ASSISTANT:0:150}..."
                fi
                if [[ -n "$BODY" ]]; then
                    BODY="${BODY}\nA: ${LAST_ASSISTANT}"
                else
                    BODY="A: ${LAST_ASSISTANT}"
                fi
            fi
        fi

        if [[ -z "$BODY" ]]; then
            BODY="Task completed"
        fi

        qnotify "$TITLE" "$BODY"
        ;;

    permission)
        qnotify "Claude Code" "Needs your confirmation"
        ;;

    *)
        echo "Usage: $0 {stop|permission}" >&2
        exit 1
        ;;
esac

exit 0
