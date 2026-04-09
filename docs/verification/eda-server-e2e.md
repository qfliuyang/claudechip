# EDA Server E2E

The right-pane tmux E2E can target a real SSH-accessible EDA server when the
server config is provided through environment variables.

## Required

```bash
export CLAUDECHIP_E2E_SSH_HOST='user@eda-host'
```

For password-based lab hosts:

```bash
export CLAUDECHIP_E2E_SSH_PASSWORD='your-password'
```

## Optional

```bash
export CLAUDECHIP_E2E_REMOTE_READY_PATTERN='__CLAUDECHIP_REMOTE_READY__'
export CLAUDECHIP_E2E_REMOTE_HOST_PATTERN='eda-host'
export CLAUDECHIP_E2E_REMOTE_CWD_PATTERN='/path/on/remote'
export CLAUDECHIP_E2E_EDA_LAUNCH='innovus -nowin'
export CLAUDECHIP_E2E_EDA_READY_PATTERN='innovus>'
```

## What The Test Does

1. Starts ClaudeChip in an isolated tmux server.
2. Switches focus to the builtin right pane.
3. SSHes into the configured server with batch mode enabled.
4. Verifies remote host visibility and a ready marker.
5. Optionally launches an EDA tool and waits for the expected prompt.

## Run

```bash
bun test tests/rightPaneTmuxE2E.test.ts --timeout 60000
```

Notes:
- The SSH path assumes key-based access.
- If `CLAUDECHIP_E2E_SSH_PASSWORD` is set, the harness uses `SSH_ASKPASS` to
  handle password login and host-key acceptance.
- The EDA launch step is skipped unless both `CLAUDECHIP_E2E_EDA_LAUNCH` and
  `CLAUDECHIP_E2E_EDA_READY_PATTERN` are set.
- The local right-pane tmux E2E still runs even without any server config.
