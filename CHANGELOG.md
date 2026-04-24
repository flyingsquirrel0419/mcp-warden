# Changelog

All notable changes to MCP Warden will be documented in this file.

This project follows a simple changelog format inspired by Keep a Changelog. Versioning is pre-1.0 and may change rapidly.

## Unreleased

### Added

- README with installation, usage, policy, dashboard, and development guidance.
- GitHub Actions CI workflow.
- Prettier configuration and format scripts.
- Community and project documentation.

### Changed

- Upgraded Vitest and coverage tooling to resolve npm audit findings.

### Security

- npm audit currently reports no known vulnerabilities.

## 0.1.0

### Added

- MCP proxy for stdio and HTTP targets.
- Policy engine with `passthrough`, `audit-only`, and `enforcing` modes.
- Allow lists, block lists, custom rules, and rate limits.
- SQLite audit logging and sensitive input masking.
- SSRF, prompt injection, and data leak detectors.
- MCP server discovery, wrapping, scan, policy sync, log, status, and dashboard commands.
- Local dashboard API and WebSocket support.
