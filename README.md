# ClaudeChip

> An enhanced fork of Claude Code with integrated terminal panel, two-pane layout, and API key-based authentication

![预览](imgs/preview.png)

## Features

- **Two-Pane Layout**: Chat on the left, integrated terminal on the right
- **Real PTY Terminal**: Full terminal emulation with `node-pty` - supports vim, htop, and interactive TUI apps
- **API Key Auth**: No OAuth required - just set your API key and go
- **Terminal Tools**: Claude can read from and write to the terminal panel via built-in tools
- **All Original Features**: Agent swarms, MCP, skills, vim mode, voice, and more

## Quick Start

```bash
# Clone the repository
git clone https://github.com/qfliuyang/claudechip.git
cd claudechip

# Install dependencies
bun install

# Launch with your API key
export CLAUDECHIP_API_KEY='your-api-key-here'
./launch-claudechip.sh
```

Or use the provided launch script which sets up everything:

```bash
./launch-claudechip.sh
```

## Configuration

Create a launch script or set environment variables:

```bash
# Required: Your API key
export CLAUDECHIP_API_KEY='your-api-key'

# Optional: Custom base URL for API
export CLAUDECHIP_BASE_URL='https://api.anthropic.com'

# Optional: Model selection
export CLAUDECHIP_OPUS_MODEL='claude-opus-4-6'
export CLAUDECHIP_SONNET_MODEL='claude-sonnet-4-6'
export CLAUDECHIP_HAIKU_MODEL='claude-haiku-4-5'
```

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+T` | Toggle terminal panel |
| `Tab` | Switch focus between chat and terminal |
| `Ctrl+C` | Exit |

## Terminal Panel

The integrated terminal panel provides:

- **Persistent Shell**: Your shell stays running across commands
- **ANSI Support**: Full color and formatting support
- **Scrollback**: Keep history of terminal output
- **Claude Integration**: Claude can observe and control the terminal

### Terminal Tools

Claude has access to these terminal-specific tools:

- `TerminalBashTool` - Execute commands in the terminal panel
- `TerminalWriteTool` - Send input to the terminal
- `TerminalReadTool` - Read terminal output

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ClaudeChip                              │
├──────────────────────────────┬──────────────────────────────┤
│                              │                              │
│   Chat Panel                 │   Terminal Panel             │
│   (React + Ink)              │   (node-pty via Node.js)     │
│                              │                              │
│   - Message history          │   - Real PTY shell           │
│   - Prompt input             │   - ANSI rendering           │
│   - Tool results             │   - Scrollback buffer        │
│                              │                              │
├──────────────────────────────┴──────────────────────────────┤
│   Bun Runtime (main) ◄──► Node.js Subprocess (PTY)          │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
├── src/
│   ├── components/
│   │   ├── terminal/         # Terminal panel component
│   │   └── TwoPaneLayout.tsx # Two-pane layout manager
│   ├── utils/
│   │   ├── terminalPty.ts    # PTY wrapper (Bun side)
│   │   └── terminalPtyNode.ts# PTY implementation (Node.js side)
│   ├── tools/
│   │   ├── TerminalBashTool/ # Terminal control tools
│   │   ├── TerminalReadTool/
│   │   └── TerminalWriteTool/
│   └── commands/             # Slash commands
├── launch-claudechip.sh      # Launch script
└── package.json
```

## Differences from Claude Code

| Feature | Claude Code | ClaudeChip |
|---------|-------------|------------|
| Authentication | OAuth required | API key only |
| Terminal | External | Integrated panel |
| Layout | Single pane | Two-pane optional |
| Distribution | npm install | Source + launcher |

## Development

```bash
# Run in development mode
bun run dev

# Run tests
bun test

# Build
bun run build
```

## Requirements

- Bun ≥ 1.3.5
- Node.js ≥ 24 (for PTY subprocess)
- macOS/Linux (Windows support pending)

## License

This is a fork of [Claude Code](https://github.com/anthropics/claude-code) by Anthropic.
Original source code copyright Anthropic, PBC.

This fork maintains the same license terms as the original project.

## Disclaimer

This is an unofficial fork created for enhanced functionality. It is not affiliated with or endorsed by Anthropic.

## Community

![交流群](imgs/qr2.png)
