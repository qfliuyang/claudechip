#!/usr/bin/env bash

# ClaudeChip Launch Script
# Sets up all environment variables and launches the application

set -e

# ClaudeChip API Configuration
export CLAUDECHIP_API_KEY='71491ddaa93744d59a21da4d85048180.mr0U7dYL5KIa4mG0'
export CLAUDECHIP_BASE_URL='https://open.bigmodel.cn/api/anthropic'

# Disable OAuth/login flow - use API key directly
export CLAUDE_CODE_SIMPLE=1

# Enable terminal panel feature via cached config (since we're in bare mode, feature flags default to true)
# Note: USER_TYPE=ant is NOT set to avoid loading internal-only tools

# Model Configuration (using glm-5.1 for all tiers)
export CLAUDECHIP_OPUS_MODEL='glm-5.1'
export CLAUDECHIP_SONNET_MODEL='glm-5.1'
export CLAUDECHIP_HAIKU_MODEL='glm-5.1'

# Terminal Configuration
export TERM='xterm-256color'
export SHELL='/bin/bash'

# Optional: Enable debug logging (uncomment if needed)
# export CLAUDE_CODE_DEBUG=1

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Launching ClaudeChip"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  API Key: ${CLAUDECHIP_API_KEY:0:15}..."
echo "  Base URL: $CLAUDECHIP_BASE_URL"
echo "  Opus Model: $CLAUDECHIP_OPUS_MODEL"
echo "  Sonnet Model: $CLAUDECHIP_SONNET_MODEL"
echo "  Haiku Model: $CLAUDECHIP_HAIKU_MODEL"
echo "  Terminal: $TERM"
echo "  Shell: $SHELL"
echo ""

# Check if running in a terminal (unless a prompt is provided as argument)
if [ $# -eq 0 ] && ([ ! -t 0 ] || [ ! -t 1 ]); then
  echo "Error: ClaudeChip TUI requires an interactive terminal."
  echo "Please run directly in a terminal (not through a pipe or script)."
  echo "Or provide a prompt: ./launch-claudechip.sh 'your prompt here'"
  exit 1
fi

echo "Starting TUI... (Press Ctrl+C to exit, type your prompt and press Enter)"
echo "=========================================="
echo ""
sleep 1

# Launch ClaudeChip in interactive TUI mode
export CLAUDE_CODE_FORCE_INTERACTIVE=1
exec bun run start "$@"
