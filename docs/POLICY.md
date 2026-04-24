# Policy Guide

Policies define how MCP Warden handles tool calls for each server.

Default path:

```text
~/.mcp-warden/policy.yaml
```

## Minimal Policy

```yaml
version: 1
```

With only `version`, Warden uses default behavior:

```yaml
defaults:
  mode: audit-only
  alert_on_new_tool: true
```

## Full Example

```yaml
version: 1

defaults:
  mode: audit-only
  alert_on_new_tool: true

servers:
  filesystem:
    mode: enforcing
    allowed_tools:
      - read_file
      - list_directory
    blocked_tools:
      - delete_file
      - run_shell
    rate_limit:
      per_minute: 60
      per_hour: 1000
      per_day: 5000
    rules:
      - name: block-secret-inputs
        description: Block calls that include an explicit token field.
        match:
          input:
            token:
              pattern: ".+"
        action: block
        message: Token input is not allowed.
```

## Top-Level Fields

| Field      | Required | Purpose                                        |
| ---------- | -------- | ---------------------------------------------- |
| `version`  | yes      | Policy format version. Must be `1`.            |
| `defaults` | no       | Defaults for all servers.                      |
| `servers`  | no       | Server-specific policies keyed by server name. |

## Policy Modes

| Mode          | Behavior                                   |
| ------------- | ------------------------------------------ |
| `passthrough` | Allows tool calls without enforcement.     |
| `audit-only`  | Allows calls but records policy decisions. |
| `enforcing`   | Blocks calls that violate policy.          |

## Server Policy Fields

| Field               | Type         | Purpose                                       |
| ------------------- | ------------ | --------------------------------------------- |
| `mode`              | string       | Overrides default policy mode.                |
| `allowed_tools`     | array or `*` | Tools allowed for the server.                 |
| `blocked_tools`     | array        | Tools that should be blocked.                 |
| `rate_limit`        | object       | Limits calls per minute, hour, or day.        |
| `rules`             | array        | Custom tool/input matching rules.             |
| `alert_on_new_tool` | boolean      | Enables notification when new tools are seen. |

## Allow and Block Lists

Allow all tools:

```yaml
allowed_tools: "*"
```

Allow specific tools:

```yaml
allowed_tools:
  - search
  - read_file
```

Block specific tools:

```yaml
blocked_tools:
  - delete_file
  - run_shell
```

In enforcing mode, prefer explicit allow lists for high-risk servers.

## Rate Limits

```yaml
rate_limit:
  per_minute: 30
  per_hour: 500
  per_day: 2000
```

Rate limits are tracked per server and window type.

## Custom Rules

Rules match a tool name and/or input fields.

```yaml
rules:
  - name: warn-broad-query
    description: Warn when search query is too broad.
    match:
      tool: search
      input:
        query:
          pattern: ".*"
    action: warn
    message: Review broad search queries before use.
```

Actions:

| Action  | Meaning                                                |
| ------- | ------------------------------------------------------ |
| `block` | Block matching calls.                                  |
| `warn`  | Allow but mark the decision as warning-level behavior. |
| `log`   | Allow and log the match.                               |

## Validation

Policy files are parsed as YAML and validated with Zod. Invalid policy files should fail fast during loading or hot reload.

Use tests when changing policy behavior:

```bash
npm test -- tests/policy
```
