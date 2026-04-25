# Security Policy

MCP Warden is security-sensitive software. It proxies MCP tool calls, evaluates policy, stores audit logs, and detects risky input or output patterns. Security issues should be handled carefully.

## Supported Versions

| Version | Status |
|---|---|
| `1.x` | ✅ Active — security fixes applied |
| `0.x` | ⚠️ Upgrade recommended |

## Reporting a Vulnerability

**Please do not open a public GitHub issue for a security vulnerability.**

Responsible disclosure process:

1. If the repository has private advisories enabled, use GitHub's **[private vulnerability reporting](https://docs.github.com/en/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)** flow.
2. Otherwise, open a minimal public issue with the title **"Security: please provide a private contact"** — no exploit details in public.

### What to Include

- **Summary** — short description of the issue.
- **Affected component** — `policy`, `proxy`, `audit`, `dashboard`, `security detectors`, etc.
- **Reproduction steps** — minimal steps or proof of concept.
- **Impact** — what could an attacker do or observe?
- **Suggested fix** — if you have one, include it.

We aim to acknowledge reports within **3 business days** and issue a fix within **14 days** for confirmed critical issues.

## Security Boundaries

MCP Warden is a **policy and observability layer**, not a process sandbox.

### What Warden Can Do

- Block or allow tool calls based on configured policy.
- Log tool calls and results to a local SQLite database.
- Mask sensitive input fields (API keys, tokens, passwords) before storage.
- Detect SSRF-like URLs in tool arguments.
- Detect prompt-injection-like patterns in tool outputs.
- Detect data-leak-like responses (high entropy, PII concentration, large payloads).
- Alert on new tools appearing from a connected server.
- Enforce per-server and per-tool rate limits.
- Verify SSH signatures on synced policy repos.

### What Warden Cannot Do

- Fully sandbox an upstream MCP server process at the OS level.
- Guarantee detection of every sensitive value or injection attempt.
- Prevent an MCP server binary from making arbitrary OS calls after startup.
- Replace OS sandboxing, containers, or network-level isolation.
- Protect against all prompt-injection variants.

For stronger isolation, combine Warden with OS-level controls (namespaces, containers, restricted service accounts) and use least-privilege API tokens for tools that require credentials.

## Handling Sensitive Data

- **Avoid passing secrets to untrusted MCP tools** — Warden masks known patterns, but cannot catch everything.
- **Treat audit logs as sensitive** — `~/.mcp-warden/warden.db` contains tool arguments and results; restrict access with filesystem permissions.
- **Dashboard is localhost-only** — do not expose it to external networks without authentication and transport security (TLS).
- **Policy files are security controls** — protect your `~/.mcp-warden/policy.yaml` from unauthorized modification; use policy sync with SSH signature verification for shared environments.

## Maintainer Security Fix Process

1. Reproduce the issue privately.
2. Add or update a regression test that demonstrates the fix.
3. Fix the root cause — prefer fail-closed behavior for policy enforcement paths.
4. Run the full check suite: `npm run format:check && npm run lint && npm test && npm run build && npm audit`.
5. Document the behavior change in the changelog.
6. Release with a clear security note in the release description.
