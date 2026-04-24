# Security Policy

MCP Warden is security-sensitive software. It proxies MCP tool calls, evaluates policy, stores audit logs, and detects risky input or output patterns.

## Supported Versions

This project is pre-1.0. Security fixes are applied to the current main development line.

| Version | Supported              |
| ------- | ---------------------- |
| `0.x`   | Current main line only |

## Reporting a Vulnerability

Please do not open a public issue for a private security vulnerability.

If private advisories are enabled for the repository, use GitHub's private vulnerability reporting flow. Otherwise, open a minimal public issue asking for a private contact path and do not include exploit details.

Include:

- A short summary of the issue.
- Affected component, such as policy, proxy, audit log, dashboard, or detector.
- Reproduction steps or proof of concept.
- Expected impact.
- Suggested fix, if known.

## Security Boundaries

MCP Warden provides local guardrails, not full process isolation.

It can:

- Block or allow tool calls based on policy.
- Log tool calls to a local SQLite database.
- Mask sensitive input fields before storage.
- Detect suspicious URLs, prompt-injection-like content, and data-leak-like responses.
- Warn or block based on configured detectors and policy mode.

It cannot:

- Fully sandbox an upstream MCP server process.
- Guarantee that every sensitive value is detected.
- Prove that every network or filesystem action is safe.
- Replace operating-system, container, or network isolation.

## Handling Secrets

- Avoid passing secrets to untrusted MCP tools.
- Treat audit logs as sensitive local data.
- Review `~/.mcp-warden/warden.db` retention and access permissions.
- Prefer least-privilege API tokens for tools that require credentials.

## Maintainer Checklist

For security fixes:

1. Reproduce the issue.
2. Add or update a regression test.
3. Fix the root cause.
4. Run `npm run format:check`, `npm run lint`, `npm test`, `npm run build`, and `npm audit`.
5. Document any behavior changes.
