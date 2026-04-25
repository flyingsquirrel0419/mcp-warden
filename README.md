<div align="center">

<img src="https://img.shields.io/badge/🛡️-MCP%20Warden-4A90D9?style=for-the-badge&labelColor=1a1a2e" alt="MCP Warden" />

# MCP Warden

**The security gateway your MCP setup didn't know it needed.**

[![CI](https://github.com/flyingsquirrel0419/mcp-warden/actions/workflows/ci.yml/badge.svg)](https://github.com/flyingsquirrel0419/mcp-warden/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/mcp-warden?color=cb3837&label=npm)](https://www.npmjs.com/package/mcp-warden)
[![Node](https://img.shields.io/badge/node-%3E%3D20.0.0-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

MCP tools can read your files, run shell commands, and hit any URL on the internet.
**Warden sits in the middle and makes sure they only do what you said they could.**

[Quick Start](#-quick-start) · [How It Works](#-how-it-works) · [Policy Files](#-policy-files) · [CLI Reference](#-cli-reference) · [Docs](#-documentation)

</div>

---

## The Problem

When you wire up an MCP server to Claude or Cursor, you're handing it power over your local environment. Most servers are trustworthy — but:

- **You can't see what tools are being called** or what arguments they receive.
- **Over-broad tools** can accidentally (or deliberately) access things they shouldn't.
- **Prompt injection attacks** can trick an AI into misusing a tool.
- **No audit trail** means you can't reconstruct what happened after the fact.

MCP Warden solves all of this without changing how your AI client works.

---

## ✨ What It Does

| Problem | What Warden does |
|---|---|
| 🔍 **No visibility** | Logs every tool call and result to a local SQLite database |
| 🚫 **Over-permissioned tools** | Allow-lists and block-lists per server, per tool |
| 💉 **Prompt injection** | Heuristic detector warns or blocks suspicious outputs |
| 🔗 **SSRF via tool args** | Blocks URL-like arguments targeting local network ranges |
| 🔑 **Secrets in logs** | Masks sensitive fields before writing to disk |
| 📊 **No audit trail** | Local dashboard with log explorer, stats, and analytics |
| 🏃 **Unknown new tools** | Detects and alerts when a server exposes a new tool |
| ⚡ **Rate abuse** | Per-server, per-tool rate limiting |
| 🔏 **Untrusted policy repos** | SSH signature verification for synced policy files |

---

## 🚀 Quick Start

```bash
# Install globally
npm install -g mcp-warden

# Step 1: Scan a server before you trust it
mcp-warden scan --target "npx @some/mcp-server"

# Step 2: Auto-discover existing MCP configs
mcp-warden discover

# Step 3: Open the dashboard to see what's happening
mcp-warden dashboard
# → http://localhost:4242
```

Or jump straight to proxying a specific server:

```bash
mcp-warden proxy \
  --target "npx @some/mcp-server" \
  --name my-server \
  --policy ~/.mcp-warden/policy.yaml
```

When the discovered config looks right, run `mcp-warden discover --wrap` to route those servers through Warden.

> **No account. No cloud. No telemetry.** Everything stays on your machine.

---

## 🏗️ How It Works

```
┌─────────────────────────────────────────────────────────┐
│                     Your Machine                         │
│                                                         │
│  ┌──────────┐    ┌──────────────┐    ┌───────────────┐  │
│  │  Claude  │───▶│  MCP Warden  │───▶│  MCP Server   │  │
│  │  Cursor  │    │              │    │  (filesystem,  │  │
│  │  etc.    │◀───│  ✓ Policy    │◀───│  shell, fetch, │  │
│  └──────────┘    │  ✓ Security  │    │  etc.)         │  │
│                  │  ✓ Audit log │    └───────────────┘  │
│                  └──────────────┘                       │
│                        │                                │
│                  ┌──────────────┐                       │
│                  │  Dashboard   │  localhost:4242        │
│                  │  SQLite DB   │  ~/.mcp-warden/       │
│                  └──────────────┘                       │
└─────────────────────────────────────────────────────────┘
```

Every tool call flows through Warden's pipeline:

1. **Policy check** — is this tool/server allowed in the configured mode?
2. **SSRF guard** — do any arguments contain suspicious URLs?
3. **Forward** — send the call to the real MCP server.
4. **Output inspection** — scan the result for injection patterns or data leaks.
5. **Audit write** — record the full decision to SQLite (with secrets masked).
6. **Return** — pass the result back to the AI client.

If a step blocks the call, the client gets a clean MCP error response — not a crash.

---

## 📋 Policy Files

Policy lives in a YAML file at `~/.mcp-warden/policy.yaml`. Here's a complete example:

```yaml
version: 1

defaults:
  mode: audit-only        # passthrough | audit-only | enforcing
  alert_on_new_tool: true

servers:
  # Strict mode for an untrusted community server
  community-tools:
    mode: enforcing
    allowed_tools:
      - search
      - summarize
    blocked_tools:
      - delete_file
      - run_shell
    rate_limit:
      per_minute: 20
      per_hour: 200
    rules:
      - name: no-token-input
        description: Block calls that pass raw tokens as arguments.
        match:
          input:
            token:
              pattern: ".+"
        action: block
        message: Token input is not allowed on this server.

  # Audit-only for a trusted internal tool
  my-notes:
    mode: audit-only
```

### Policy Modes

| Mode | What happens |
|---|---|
| `passthrough` | Warden is transparent — calls go through, nothing is blocked |
| `audit-only` | Calls go through, policy violations are **logged** but not blocked |
| `enforcing` | Policy violations are **blocked** with an MCP error response |

Start with `audit-only` to learn what your servers do, then move to `enforcing` when you're confident.

---

## 💻 CLI Reference

```bash
mcp-warden <command> [options]
```

| Command | What it does |
|---|---|
| `proxy --target <cmd>` | Start the security gateway for an MCP server |
| `scan --target <cmd>` | Inspect a server's tools and estimate risk before connecting |
| `discover` | Find MCP servers in Claude Desktop, Cursor, and `.mcp.json` |
| `discover --wrap` | Rewrite discovered configs to route through Warden |
| `init` | Interactively wrap existing MCP client configurations |
| `status` | Show recent audit log entries |
| `log` | Query audit logs with filters |
| `dashboard` | Start the local web dashboard (`--port` to override 4242) |
| `policy sync` | Sync policy files from a Git repo |
| `policy list` | List synced policy files |
| `policy apply` | Apply a synced policy file |
| `policy trust-key` | Add a trusted SSH signer for policy repo verification |
| `policy list-keys` | Show trusted SSH signers |

### Useful Log Queries

```bash
# Show calls to a specific tool
mcp-warden log --server my-server --tool search --limit 20

# Show only blocked calls
mcp-warden log --blocked

# Tail logs in real time
mcp-warden log --tail
```

### Policy Sync from Git

Keep policy in a shared repo and sync it to any machine:

```bash
# Preview what's in a policy repo
mcp-warden policy sync --repo https://github.com/example/mcp-policies.git --list

# Apply a specific policy file
mcp-warden policy apply \
  --repo https://github.com/example/mcp-policies.git \
  --policy strict.yaml

# Skip signature verification (not recommended for production)
mcp-warden policy sync --repo <url> --no-verify
```

Policy repos are verified against SSH-signed commits. Add trusted signers with `policy trust-key`.

---

## 📊 Dashboard

```bash
mcp-warden dashboard        # → http://localhost:4242
mcp-warden dashboard --port 8080
```

The dashboard gives you a local UI for exploring audit logs, viewing policy, and checking per-server and per-tool statistics. It reads directly from your local SQLite database — no network requests.

Available APIs:

```
GET  /api/status
GET  /api/logs/recent
GET  /api/stats/server/:name
GET  /api/stats/tools
GET  /api/stats/analytics
GET  /api/policy
PUT  /api/policy
GET  /api/config
PUT  /api/config
```

> ⚠️ The dashboard binds to localhost only. Do not expose it publicly without adding authentication and network controls.

---

## 📦 Installation

### npm (recommended)

```bash
npm install -g mcp-warden
```

Or run without installing:

```bash
npx mcp-warden --help
```

### Homebrew

```bash
brew install --formula https://github.com/flyingsquirrel0419/mcp-warden/releases/latest/download/mcp-warden.rb
```

### curl installer

```bash
# Latest release
curl -fsSL https://github.com/flyingsquirrel0419/mcp-warden/releases/latest/download/install.sh | sh

# Specific version
MCP_WARDEN_VERSION=1.0.0 sh -c "$(curl -fsSL https://github.com/flyingsquirrel0419/mcp-warden/releases/latest/download/install.sh)"
```

### Build from source

```bash
git clone https://github.com/flyingsquirrel0419/mcp-warden.git
cd mcp-warden
npm ci && npm run build
npm link          # makes `mcp-warden` available globally
```

**Requirements:** Node.js `>=20.0.0`, npm.

---

## 🔒 Security Notes

MCP Warden is a policy and observability layer — not a sandbox. It cannot fully restrict what a running MCP server process can do at the OS level.

- Policy enforcement is only as strong as your configured mode (`enforcing` blocks, `audit-only` records).
- Audit logs are stored locally under `~/.mcp-warden`. Treat `warden.db` as sensitive.
- Input masking covers well-known secret patterns — avoid passing secrets to untrusted tools regardless.
- SSRF and data-leak detectors are **heuristic** — they catch common patterns, not everything.
- For stronger isolation, combine Warden with OS sandboxing, containers, or restricted API tokens.

See [SECURITY_MODEL.md](docs/SECURITY_MODEL.md) for a full breakdown of what Warden does and doesn't protect against.

---

## 🗂️ Project Structure

```
src/
├── audit/       SQLite audit log, masking, database setup
├── cli/         Commander-based CLI commands
├── daemon/      Notification delivery
├── dashboard/   Local Express API and static dashboard
├── policy/      Schema, loader, engine, sync, rate limiter, signature verification
├── proxy/       MCP proxy, transports, request handlers, notification relay
├── security/    SSRF guard, injection detector, data leak detector
└── utils/       Config paths, logger, shared error types
```

---

## 🧑‍💻 Development

```bash
npm ci              # install dependencies
npm run build       # compile TypeScript
npm run dev         # watch mode
npm run format      # auto-format with Prettier
```

### Testing

```bash
npm test                  # full test suite (Vitest)
npm run test:coverage     # with coverage report
npm run lint              # TypeScript type check
```

Run the same checks as CI before opening a PR:

```bash
npm run format:check && npm run lint && npm test && npm run build && npm audit
```

---

## 🤝 Contributing

Contributions are very welcome. MCP security tooling is still early — there's a lot of ground to cover.

**Good first areas:**
- New security detector heuristics (more injection patterns, new secret formats)
- Dashboard UI improvements
- Additional policy rule actions and conditions
- Integration tests for new MCP server types

**Before you open a PR:**
1. Create a topic branch.
2. Make the smallest useful change.
3. Add or update tests (especially for policy, proxy, and security changes).
4. Pass all CI checks locally (see above).
5. Describe the security implications if your change touches `src/policy`, `src/proxy`, `src/security`, or `src/audit`.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide and PR checklist.
Report vulnerabilities privately via [SECURITY.md](SECURITY.md).

---

## 📚 Documentation

| Doc | What's in it |
|---|---|
| [CLI guide](docs/CLI.md) | Every command, flag, and option |
| [Policy guide](docs/POLICY.md) | Policy schema, modes, rules, and sync |
| [Architecture](ARCHITECTURE.md) | Component breakdown and request flow |
| [Security model](docs/SECURITY_MODEL.md) | What Warden protects and what it doesn't |
| [Operations guide](docs/OPERATIONS.md) | Config paths, log rotation, production tips |
| [Release guide](docs/RELEASE.md) | How releases and versioning work |
| [Changelog](CHANGELOG.md) | What changed and when |

---

## License

[Apache-2.0](LICENSE) — free to use, modify, and distribute.

---

<div align="center">

Built for the MCP community. ⭐ Star it if it helps you.

</div>
