#!/usr/bin/env bash
# ClaudeChip — launch script for interactive TUI testing
#
# Usage:
#   ./launch-claudechip.sh              # interactive TUI
#   ./launch-claudechip.sh 'my prompt'  # non-interactive, send a prompt

set -euo pipefail

# ── API / model config ────────────────────────────────────────────────────────
export CLAUDECHIP_API_KEY="${CLAUDECHIP_API_KEY:-71491ddaa93744d59a21da4d85048180.mr0U7dYL5KIa4mG0}"
export CLAUDECHIP_BASE_URL="${CLAUDECHIP_BASE_URL:-https://open.bigmodel.cn/api/anthropic}"
export CLAUDECHIP_OPUS_MODEL="${CLAUDECHIP_OPUS_MODEL:-glm-5.1}"
export CLAUDECHIP_SONNET_MODEL="${CLAUDECHIP_SONNET_MODEL:-glm-5.1}"
export CLAUDECHIP_HAIKU_MODEL="${CLAUDECHIP_HAIKU_MODEL:-glm-5.1}"

# Disable OAuth/login flow — use API key directly
export CLAUDE_CODE_SIMPLE=1

# Enable fullscreen TUI mode (sticky-scroll, bottom-pinned messages)
# Without this, isFullscreenEnvEnabled() returns false for non-ant users
# and messages render from top instead of bottom.
export CLAUDE_CODE_NO_FLICKER=1

# ── Terminal config ───────────────────────────────────────────────────────────
export TERM="${TERM:-xterm-256color}"
export SHELL="${SHELL:-/bin/zsh}"

# Force interactive TUI even when launched from a script
export CLAUDE_CODE_FORCE_INTERACTIVE=1

# ── Debug (uncomment to enable) ───────────────────────────────────────────────
# export CLAUDE_CODE_DEBUG=1

# ── Preflight checks ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v bun &>/dev/null; then
  echo "error: 'bun' not found in PATH" >&2
  exit 1
fi

if [ ! -f src/dev-entry.ts ]; then
  echo "error: src/dev-entry.ts not found — run from the repo root" >&2
  exit 1
fi

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
