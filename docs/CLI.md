# CLI Guide

Warden CLI exposes a single CLI binary:

```bash
warden
```

Build from source before local use:

```bash
npm ci
npm run build
npm link
```

## Commands

### `proxy`

Start proxying an MCP server through Warden.

```bash
warden proxy --target "npx @some/mcp-server" --name my-server
```

Options:

| Option                   | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `-t, --target <command>` | MCP server command or HTTP target to proxy.   |
| `-n, --name <name>`      | Display name used in policy and audit logs.   |
| `-p, --policy <path>`    | Path to a policy YAML file.                   |
| `-w, --watch-policy`     | Watch the policy file and hot-reload changes. |

### `scan`

Inspect an MCP server's exposed tools and estimate risk.

```bash
warden scan --target "npx @some/mcp-server"
warden scan --target "npx @some/mcp-server" --json
```

The scan command evaluates tool names and descriptions for common indicators such as network access, filesystem access, mutation, and command execution.

### `discover`

Find MCP server configs in known locations.

```bash
warden discover
warden discover --json
warden discover --wrap
```

Known sources:

- Claude Desktop config
- Cursor `.cursor/mcp.json`
- Project or parent `.mcp.json`

`--wrap` rewrites discovered server entries to run through `warden proxy`.

### `init`

Wrap existing MCP client configurations.

```bash
warden init
```

This command creates a `.backup` file before rewriting a config when no backup exists.

### `status`

Show recent audit log entries.

```bash
warden status
```

### `log`

Query audit logs.

```bash
warden log
warden log --server my-server
warden log --tool search
warden log --blocked
warden log --limit 100
warden log --tail
```

### `dashboard`

Start the local dashboard.

```bash
warden dashboard
warden dashboard --port 4242
```

### `policy`

Manage synced policy repositories.

```bash
warden policy sync --repo https://github.com/example/policies.git --list
warden policy list --repo https://github.com/example/policies.git
warden policy apply --repo https://github.com/example/policies.git --policy strict.yaml
```

## Exit Behavior

Most commands write user-facing information to stdout and errors to stderr. Commands that cannot complete should exit non-zero.

## Common Workflows

### Try a server safely

```bash
warden scan --target "npx @some/mcp-server"
warden proxy --target "npx @some/mcp-server" --name trial
warden log --server trial
```

### Enforce a policy

```bash
warden proxy \
  --target "npx @some/mcp-server" \
  --name production-tools \
  --policy ~/.warden/policy.yaml \
  --watch-policy
```

### Inspect recent activity

```bash
warden status
warden log --blocked
warden dashboard
```
