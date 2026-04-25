# Contributing to MCP Warden

First off — thanks for wanting to help. MCP security tooling is early-stage and there's a lot of room to make it genuinely better. Every contribution matters.

## 🧭 Where to Start

Not sure what to work on? Here are areas that would have real impact:

- **Security detectors** — new prompt-injection patterns, secret formats, data-leak heuristics
- **Dashboard UX** — better log visualization, filtering, or alerting UI
- **Policy language** — new rule conditions, actions, or shorthand syntax
- **MCP client support** — discovery for clients beyond Claude Desktop / Cursor
- **Documentation** — examples, guides, common policy patterns
- **Tests** — coverage gaps in edge cases and integration paths

If you have an idea that doesn't fit these categories, open an issue first to discuss it — that saves you time if the direction isn't a fit.

## 🛠️ Development Setup

```bash
git clone https://github.com/flyingsquirrel0419/mcp-warden.git
cd mcp-warden
npm ci
npm run build
npm test
```

For local CLI testing:

```bash
npm link
mcp-warden --help
```

## 🌿 Branch Workflow

1. Fork and create a topic branch (`fix/ssrf-loopback`, `feat/new-rule-action`, etc.).
2. Make the smallest useful change — focused PRs get reviewed faster.
3. Add or update tests.
4. Run the full local check suite.
5. Open a pull request with a short description and how you verified the change.

## ✅ Local Check Suite

Run this before every PR — it's what CI runs:

```bash
npm run format:check   # check formatting
npm run lint           # TypeScript type check
npm test               # full test suite
npm run build          # compile
npm audit              # dependency vulnerability check
```

Fix issues with:

```bash
npm run format         # auto-format
```

## 🧪 Testing Guidelines

- Tests live in `tests/` mirroring the `src/` folder structure.
- Use temporary directories and in-memory databases for filesystem and SQLite tests.
- Tests must be deterministic — no network access unless it's an explicit integration test.
- For policy changes, cover all three modes: `passthrough`, `audit-only`, `enforcing`.
- For security detectors, include: clean input ✅, suspicious input ❌, and boundary cases ⚠️.

## 🔐 Security-Sensitive Changes

Changes touching `src/policy`, `src/proxy`, `src/security`, or `src/audit` need extra care. In your PR description, answer:

- What risk does this change address (or introduce)?
- What behavior is blocked, warned, or allowed after the change?
- How is failure handled — fail open or fail closed?
- Which tests prove the behavior?

For private vulnerability reports, follow [SECURITY.md](SECURITY.md).

## 📝 Commit Style

Short, imperative messages:

```
Add injection pattern for base64 encoded payloads
Fix SSRF check missing IPv6 loopback
Document policy sync signature flow
```

## PR Checklist

Before requesting review:

- [ ] The change has a clear, user-facing reason.
- [ ] Tests were added or updated when behavior changed.
- [ ] `npm run format:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm audit` reports no new vulnerabilities.
- [ ] Security implications are described (for `policy/`, `proxy/`, `security/`, `audit/`).

## Ground Rules

- Keep pull requests focused on one concern — multi-concern PRs are harder to review and slower to land.
- Prefer explicit security behavior over silent assumptions.
- Do not weaken policy enforcement, masking, SSRF checks, or data-leak detection without a clear call-out in the PR.
- Avoid unrelated formatting or refactors inside feature/bugfix PRs.

Questions? Open an issue or start a discussion — happy to help.
