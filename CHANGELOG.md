# Changelog

All notable changes to Warden CLI will be documented in this file.

This project follows a simple changelog format inspired by Keep a Changelog.

## Unreleased

No unreleased changes.

## 1.0.0

### Security

- **Runtime security detectors now enabled**: the proxy now wires SSRF, prompt-injection, data-leak, and notification components into the live `RequestHandler` path instead of only testing them in isolation.
- **Audit log shutdown flush**: pending audit writes are tracked and flushed before proxy shutdown closes SQLite, reducing the chance of losing final blocked/allowed decision records.
- **Policy sync ESM runtime fix**: removed dynamic CommonJS `require()` usage from policy sync/config parsing paths so the ESM bundle works when reading synced policy configuration.
- **SSRF loopback range fixed**: entire `127.0.0.0/8` range is now blocked (previously only `127.0.0.1`). Addresses `127.0.0.2`–`127.255.255.255` were passing through unchecked.
- **ReDoS protection added**: policy YAML regex patterns are validated before compilation. Patterns exceeding 200 characters or containing nested quantifiers (e.g. `(a+)+`) are rejected.
- **Masker no longer leaks secret prefixes**: `maskString()` replaced raw 8-char prefix with a named token type label (e.g. `[anthropic-key]***REDACTED***`).
- **Dashboard localhost-only middleware**: non-local requests are now rejected with `403` by default.
- **Policy sync SSH signature verification**: policy repos are now verified against SSH-signed commits before applying. New `trust-key` and `list-keys` CLI commands for managing trusted signers. Fast-forward-only pulls prevent history rewrite attacks.

### Changed

- MCP target parsing and config wrapping now preserve quoted arguments with spaces instead of flattening command arrays into lossy strings.
- Rate limiter counters are now persisted through the local SQLite `rate_limits` table when a database is available.
- New-tool detection is carried through policy evaluation to avoid double-mutating the known-tool state before notification dispatch.
- Build output now refreshes dashboard static assets before packaging to avoid nested stale `dist/public/public` assets.
- CLI and MCP client/server runtime version strings now report `1.0.0`.
- Project license changed from MIT to Apache-2.0.
- `RequestHandler.toolsCache` converted from a static variable to a `Map` keyed by server name, preventing cross-proxy cache collisions in multi-server setups.
- `RequestHandler.clearCache()` now accepts an optional `serverName` parameter for targeted cache invalidation.
- `PolicySync.syncRepo()` now accepts an options object `{ branch?, verifySignature? }` instead of a plain branch string. Signature verification defaults to enabled.
- Fast-forward-only check added to `PolicySync` pull path to prevent history rewrite attacks.

### Fixed

- Installed `warden` and `warden-cli` binaries now launch correctly through npm global symlinks.

### Added

- Tag-based GitHub Actions release workflow for npm, Homebrew formula, and curl installer distribution.
- `scripts/install.sh` curl installer and Homebrew formula generation for release assets.
- Release guide documenting tag format, optional `NPM_TOKEN`, release assets, and install commands.
- Regression coverage for live proxy security wiring, audit flush behavior, ESM-safe policy sync config parsing, quoted MCP target parsing, and database-backed rate-limit persistence.
- `TrustedSigners` class for managing `~/.warden/allowed_signers` file.
- `SignatureVerifier` class for verifying git commit SSH signatures via `git verify-commit`.
- `PolicySignatureError` error class for signature verification failures.
- `warden policy trust-key` CLI command to add trusted signers.
- `warden policy list-keys` CLI command to list trusted signers.
- `--no-verify` flag on `warden policy sync` to skip signature verification.

## 0.1.0

### Added

- MCP proxy for stdio and HTTP targets.
- Policy engine with `passthrough`, `audit-only`, and `enforcing` modes.
- Allow lists, block lists, custom rules, and rate limits.
- SQLite audit logging and sensitive input masking.
- SSRF, prompt injection, and data leak detectors.
- MCP server discovery, wrapping, scan, policy sync, log, status, and dashboard commands.
- Local dashboard API and WebSocket support.
- README with installation, usage, policy, dashboard, and development guidance.
- GitHub Actions CI workflow.
- Prettier configuration and format scripts.
- Community and project documentation.
- Upgraded Vitest and coverage tooling to resolve npm audit findings.
