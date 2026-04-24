# Changelog

All notable changes to MCP Warden will be documented in this file.

This project follows a simple changelog format inspired by Keep a Changelog. Versioning is pre-1.0 and may change rapidly.

## Unreleased

### Security

- **SSRF loopback range fixed**: entire `127.0.0.0/8` range is now blocked (previously only `127.0.0.1`). Addresses `127.0.0.2`–`127.255.255.255` were passing through unchecked.
- **ReDoS protection added**: policy YAML regex patterns are validated before compilation. Patterns exceeding 200 characters or containing nested quantifiers (e.g. `(a+)+`) are rejected.
- **Masker no longer leaks secret prefixes**: `maskString()` replaced raw 8-char prefix with a named token type label (e.g. `[anthropic-key]***REDACTED***`).
- **Dashboard localhost-only middleware**: non-local requests are now rejected with `403` by default.

### Changed

- `RequestHandler.toolsCache` converted from a static variable to a `Map` keyed by server name, preventing cross-proxy cache collisions in multi-server setups.
- `RequestHandler.clearCache()` now accepts an optional `serverName` parameter for targeted cache invalidation.

## 0.1.0

### Added

- README with installation, usage, policy, dashboard, and development guidance.
- GitHub Actions CI workflow.
- Prettier configuration and format scripts.
- Community and project documentation.
- Upgraded Vitest and coverage tooling to resolve npm audit findings.

## 0.1.0

### Added

- MCP proxy for stdio and HTTP targets.
- Policy engine with `passthrough`, `audit-only`, and `enforcing` modes.
- Allow lists, block lists, custom rules, and rate limits.
- SQLite audit logging and sensitive input masking.
- SSRF, prompt injection, and data leak detectors.
- MCP server discovery, wrapping, scan, policy sync, log, status, and dashboard commands.
- Local dashboard API and WebSocket support.
