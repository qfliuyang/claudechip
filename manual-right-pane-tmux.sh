#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_DIR="/tmp/claudechip-manual-right-pane"
SOCKET_PATH="$STATE_DIR/tmux.sock"
SESSION_NAME="claudechip-manual"
CAPTURE_PATH="$STATE_DIR/latest-pane.txt"

mkdir -p "$STATE_DIR"

tmux_cmd() {
  tmux -S "$SOCKET_PATH" "$@"
}

start_session() {
  if tmux_cmd has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session already running."
    echo "attach: tmux -S $SOCKET_PATH attach -t $SESSION_NAME"
    return 0
  fi

  tmux_cmd new-session -d -s "$SESSION_NAME" -x 170 -y 44 \
    "cd '$ROOT_DIR' && ./launch-claudechip.sh"

  cat <<EOF
Started ClaudeChip in an isolated tmux session.

socket:  $SOCKET_PATH
session: $SESSION_NAME
attach:  tmux -S $SOCKET_PATH attach -t $SESSION_NAME
capture: $0 capture
stop:    $0 stop
EOF
}

attach_session() {
  exec tmux -S "$SOCKET_PATH" attach -t "$SESSION_NAME"
}

capture_session() {
  tmux_cmd capture-pane -pt "$SESSION_NAME":0.0 >"$CAPTURE_PATH"
  echo "Captured pane to $CAPTURE_PATH"
}

stop_session() {
  tmux_cmd kill-server 2>/dev/null || true
  rm -f "$SOCKET_PATH"
  echo "Stopped isolated tmux session."
}

status_session() {
  if tmux_cmd has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "running"
    echo "socket:  $SOCKET_PATH"
    echo "session: $SESSION_NAME"
    echo "attach:  tmux -S $SOCKET_PATH attach -t $SESSION_NAME"
  else
    echo "stopped"
  fi
}

usage() {
  cat <<EOF
Usage:
  $0 start
  $0 attach
  $0 capture
  $0 status
  $0 stop
EOF
}

cmd="${1:-start}"

case "$cmd" in
  start)
    start_session
    ;;
  attach)
    attach_session
    ;;
  capture)
    capture_session
    ;;
  status)
    status_session
    ;;
  stop)
    stop_session
    ;;
  *)
    usage
    exit 1
    ;;
esac
