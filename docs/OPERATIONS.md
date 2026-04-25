# Operations Guide

This guide covers routine local operation for Warden CLI.

## Local Data

Warden stores local state under:

```text
~/.warden/
```

Important files:

| Path          | Purpose                    |
| ------------- | -------------------------- |
| `config.yaml` | Local runtime settings.    |
| `policy.yaml` | Default policy file.       |
| `warden.db`   | SQLite audit log database. |
| `logs/`       | Log directory.             |

## Starting a Proxy

```bash
warden proxy \
  --target "npx @some/mcp-server" \
  --name my-server \
  --policy ~/.warden/policy.yaml \
  --watch-policy
```

Use `--watch-policy` when iterating on policy locally. If policy reload fails, the existing loaded policy remains active.

## Dashboard

```bash
warden dashboard --port 4242
```

Default URL:

```text
http://localhost:4242
```

Keep the dashboard bound to trusted local environments. It exposes local audit and policy data.

## Audit Log Review

```bash
warden status
warden log --limit 50
warden log --blocked
warden log --tail
```

Audit entries include:

- timestamp
- server
- tool
- masked input
- output size
- duration
- block status
- block reason
- policy mode

## Backups

Commands that rewrite MCP client config files create `.backup` files when no backup exists.

Before large changes, manually back up:

```bash
cp ~/.warden/policy.yaml ~/.warden/policy.yaml.backup
cp ~/.warden/warden.db ~/.warden/warden.db.backup
```

## Troubleshooting

### No audit logs found

Run a proxy first and call at least one tool:

```bash
warden proxy --target "npx @some/mcp-server" --name test
warden status
```

### Policy does not seem to apply

Check:

- The proxy was started with the expected `--name`.
- The policy has a matching key under `servers`.
- The proxy was started with `--policy` or the file is at `~/.warden/policy.yaml`.
- The mode is `enforcing` when you expect blocks.

### Dashboard port is in use

Start on another port:

```bash
warden dashboard --port 4243
```

### Scan fails

Verify the target command works outside Warden:

```bash
npx @some/mcp-server
```

Then retry:

```bash
warden scan --target "npx @some/mcp-server"
```

## Upgrade Checks

After dependency or runtime upgrades:

```bash
npm ci
npm run format:check
npm run lint
npm test
npm run build
npm audit
```

## Release Operations

Releases are tag-driven. Pushing `vX.Y.Z` runs the release workflow, validates that the tag matches `package.json`, publishes npm when `NPM_TOKEN` is configured, and attaches Homebrew/curl assets to the GitHub Release.

See [Release Guide](RELEASE.md) for the full checklist.
