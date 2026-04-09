#!/usr/bin/env bash
# ClaudeChip — launch script for interactive TUI testing
#
# Usage:
#   ./launch-claudechip.sh                        # interactive TUI
#   ./launch-claudechip.sh 'my prompt'            # non-interactive, send a prompt
#   ./launch-claudechip.sh tmux-start            # start isolated tmux session
#   ./launch-claudechip.sh tmux-attach           # attach to isolated tmux session
#   ./launch-claudechip.sh tmux-capture          # capture isolated tmux pane
#   ./launch-claudechip.sh tmux-status           # show isolated tmux status
#   ./launch-claudechip.sh tmux-stop             # stop isolated tmux session

set -euo pipefail

# ── API / model config ────────────────────────────────────────────────────────
export CLAUDECHIP_API_KEY="${CLAUDECHIP_API_KEY:-0738c63ac1c6401e9a3bf2f8463f2ec0.HDVDwlC6enwQTRGy}"
export CLAUDECHIP_BASE_URL="${CLAUDECHIP_BASE_URL:-https://open.bigmodel.cn/api/anthropic}"
export CLAUDECHIP_OPUS_MODEL="${CLAUDECHIP_OPUS_MODEL:-glm-5.1}"
export CLAUDECHIP_SONNET_MODEL="${CLAUDECHIP_SONNET_MODEL:-glm-5.1}"
export CLAUDECHIP_HAIKU_MODEL="${CLAUDECHIP_HAIKU_MODEL:-glm-5.1}"
export CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-/tmp/claudechip-config}"

# Enable fullscreen TUI mode (sticky-scroll, bottom-pinned messages)
# Without this, isFullscreenEnvEnabled() returns false for non-ant users
# and messages render from top instead of bottom.
export CLAUDE_CODE_NO_FLICKER=1

# ── Terminal config ───────────────────────────────────────────────────────────
export TERM="${TERM:-xterm-256color}"
export SHELL="${SHELL:-/bin/zsh}"

# Force interactive TUI even when launched from a script
export CLAUDE_CODE_FORCE_INTERACTIVE=1
export DISABLE_AUTOUPDATER="${DISABLE_AUTOUPDATER:-1}"
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC="${CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:-1}"
export CLAUDECHIP_SKIP_UPSTREAM_VERSION_CHECK="${CLAUDECHIP_SKIP_UPSTREAM_VERSION_CHECK:-1}"

# ── Debug (uncomment to enable) ───────────────────────────────────────────────
# export CLAUDE_CODE_DEBUG=1

# ── Preflight checks ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

TMUX_STATE_DIR="/tmp/claudechip-manual-right-pane"
TMUX_SOCKET_PATH="$TMUX_STATE_DIR/tmux.sock"
TMUX_SESSION_NAME="claudechip-manual"
TMUX_CAPTURE_PATH="$TMUX_STATE_DIR/latest-pane.txt"
CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_DIR/.claude.json"

if ! command -v bun &>/dev/null; then
  echo "error: 'bun' not found in PATH" >&2
  exit 1
fi

if [ ! -f src/dev-entry.ts ]; then
  echo "error: src/dev-entry.ts not found — run from the repo root" >&2
  exit 1
fi

seed_claudechip_config() {
  mkdir -p "$CLAUDE_CONFIG_DIR"
  CLAUDECHIP_KEY_SUFFIX="${CLAUDECHIP_API_KEY: -20}"
  CLAUDECHIP_KEY_SUFFIX="$CLAUDECHIP_KEY_SUFFIX" CLAUDE_CONFIG_FILE="$CLAUDE_CONFIG_FILE" bun -e '
    import { existsSync, readFileSync, writeFileSync } from "fs"

    const configFile = process.env.CLAUDE_CONFIG_FILE
    const approvedSuffix = process.env.CLAUDECHIP_KEY_SUFFIX

    if (!configFile || !approvedSuffix) {
      throw new Error("Missing launcher config inputs")
    }

    let config = {}
    if (existsSync(configFile)) {
      try {
        config = JSON.parse(readFileSync(configFile, "utf8"))
      } catch {
        config = {}
      }
    }

    const currentResponses =
      typeof config.customApiKeyResponses === "object" && config.customApiKeyResponses !== null
        ? config.customApiKeyResponses
        : {}

    const approved = Array.isArray(currentResponses.approved)
      ? currentResponses.approved.filter(value => value !== approvedSuffix)
      : []

    const rejected = Array.isArray(currentResponses.rejected)
      ? currentResponses.rejected.filter(value => value !== approvedSuffix)
      : []

    config = {
      ...config,
      customApiKeyResponses: {
        ...currentResponses,
        approved: [...approved, approvedSuffix],
        rejected,
      },
    }

    writeFileSync(configFile, `${JSON.stringify(config, null, 2)}\n`)
  '
}

tmux_cmd() {
  tmux -S "$TMUX_SOCKET_PATH" "$@"
}

handle_tmux_mode() {
  mkdir -p "$TMUX_STATE_DIR"

  case "${1:-}" in
    tmux-start)
      if tmux_cmd has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
        cat <<EOF
Isolated ClaudeChip tmux session already running.
socket:  $TMUX_SOCKET_PATH
session: $TMUX_SESSION_NAME
attach:  ./launch-claudechip.sh tmux-attach
capture: ./launch-claudechip.sh tmux-capture
stop:    ./launch-claudechip.sh tmux-stop
EOF
        exit 0
      fi

      tmux_cmd new-session -d -s "$TMUX_SESSION_NAME" -x 170 -y 44 \
        "cd '$SCRIPT_DIR' && ./launch-claudechip.sh"

      cat <<EOF
Started ClaudeChip in an isolated tmux session.
socket:  $TMUX_SOCKET_PATH
session: $TMUX_SESSION_NAME
attach:  ./launch-claudechip.sh tmux-attach
capture: ./launch-claudechip.sh tmux-capture
stop:    ./launch-claudechip.sh tmux-stop
EOF
      exit 0
      ;;
    tmux-attach)
      exec tmux -S "$TMUX_SOCKET_PATH" attach -t "$TMUX_SESSION_NAME"
      ;;
    tmux-capture)
      tmux_cmd capture-pane -pt "$TMUX_SESSION_NAME":0.0 >"$TMUX_CAPTURE_PATH"
      echo "Captured pane to $TMUX_CAPTURE_PATH"
      exit 0
      ;;
    tmux-status)
      if tmux_cmd has-session -t "$TMUX_SESSION_NAME" 2>/dev/null; then
        cat <<EOF
running
socket:  $TMUX_SOCKET_PATH
session: $TMUX_SESSION_NAME
attach:  ./launch-claudechip.sh tmux-attach
EOF
      else
        echo "stopped"
      fi
      exit 0
      ;;
    tmux-stop)
      tmux_cmd kill-server 2>/dev/null || true
      rm -f "$TMUX_SOCKET_PATH"
      echo "Stopped isolated tmux session."
      exit 0
      ;;
  esac
}

handle_tmux_mode "${1:-}"
seed_claudechip_config

# Require an interactive terminal when no prompt is given
if [ $# -eq 0 ] && { [ ! -t 0 ] || [ ! -t 1 ]; }; then
  echo "error: ClaudeChip TUI requires an interactive terminal." >&2
  echo "  Run directly in a terminal, or pass a prompt:" >&2
  echo "  ./launch-claudechip.sh 'describe this circuit'" >&2
  exit 1
fi

# ── Key-binding reminder (only in interactive mode) ───────────────────────────
if [ $# -eq 0 ]; then
  cat <<'EOF'
┌─ ClaudeChip ────────────────────────────────────┐
│  Two-pane layout: chat (left)  terminal (right)  │
│                                                  │
│  Ctrl+B   toggle focus between panes             │
│  Ctrl+C   interrupt running command (terminal)   │
│  Ctrl+D   send EOF to shell                      │
│  Tab      shell autocomplete (when in terminal)  │
│  /exit    quit                                   │
└──────────────────────────────────────────────────┘
EOF
fi

# ── Launch ────────────────────────────────────────────────────────────────────
exec bun run start "$@"
