# CLI Guide

MCP Warden exposes a single CLI binary:

```bash
mcp-warden
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
mcp-warden proxy --target "npx @some/mcp-server" --name my-server
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
mcp-warden scan --target "npx @some/mcp-server"
mcp-warden scan --target "npx @some/mcp-server" --json
```

The scan command evaluates tool names and descriptions for common indicators such as network access, filesystem access, mutation, and command execution.

### `discover`

Find MCP server configs in known locations.

```bash
mcp-warden discover
mcp-warden discover --json
mcp-warden discover --wrap
```

Known sources:

- Claude Desktop config
- Cursor `.cursor/mcp.json`
- Project or parent `.mcp.json`

`--wrap` rewrites discovered server entries to run through `mcp-warden proxy`.

### `init`

Wrap existing MCP client configurations.

```bash
mcp-warden init
```

This command creates a `.backup` file before rewriting a config when no backup exists.

### `status`

Show recent audit log entries.

```bash
mcp-warden status
```

### `log`

Query audit logs.

```bash
mcp-warden log
mcp-warden log --server my-server
mcp-warden log --tool search
mcp-warden log --blocked
mcp-warden log --limit 100
mcp-warden log --tail
```

### `dashboard`

Start the local dashboard.

```bash
mcp-warden dashboard
mcp-warden dashboard --port 4242
```

### `policy`

Manage synced policy repositories.

```bash
mcp-warden policy sync --repo https://github.com/example/policies.git --list
mcp-warden policy list --repo https://github.com/example/policies.git
mcp-warden policy apply --repo https://github.com/example/policies.git --policy strict.yaml
```

## Exit Behavior

Most commands write user-facing information to stdout and errors to stderr. Commands that cannot complete should exit non-zero.

## Common Workflows

### Try a server safely

```bash
mcp-warden scan --target "npx @some/mcp-server"
mcp-warden proxy --target "npx @some/mcp-server" --name trial
mcp-warden log --server trial
```

### Enforce a policy

```bash
mcp-warden proxy \
  --target "npx @some/mcp-server" \
  --name production-tools \
  --policy ~/.mcp-warden/policy.yaml \
  --watch-policy
```

### Inspect recent activity

```bash
mcp-warden status
mcp-warden log --blocked
mcp-warden dashboard
```
