# Contributing

Thanks for taking the time to improve MCP Warden. This project is a local-first security gateway for MCP servers, so changes should be small, reviewable, and careful about failure modes.

## Ground Rules

- Keep pull requests focused on one concern.
- Add tests for behavior changes.
- Prefer explicit security behavior over silent assumptions.
- Do not weaken policy enforcement, masking, SSRF checks, or data-leak detection without calling it out clearly.
- Avoid unrelated formatting or refactors in feature and bugfix PRs.

## Development Setup

```bash
npm ci
npm run build
npm test
```

For local CLI testing:

```bash
npm link
mcp-warden --help
```

## Branch Workflow

1. Create a topic branch.
2. Make the smallest useful change.
3. Add or update tests.
4. Run the local checks.
5. Open a pull request with a clear summary and verification notes.

## Local Checks

Run these before opening a pull request:

```bash
npm run format:check
npm run lint
npm test
npm run build
npm audit
```

Use `npm run format` to apply formatting.

## Testing Guidelines

- Put unit tests next to the domain folder under `tests/`.
- Use temporary directories and databases for filesystem or SQLite tests.
- Keep tests deterministic and avoid network access unless the test is explicitly integration-level.
- For policy changes, cover `passthrough`, `audit-only`, and `enforcing` behavior where relevant.
- For security detectors, include clean input, suspicious input, and boundary cases.

## Pull Request Checklist

- [ ] The change has a clear user-facing or maintainer-facing reason.
- [ ] Tests were added or updated when behavior changed.
- [ ] `npm run format:check` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run build` passes.
- [ ] `npm audit` reports no known vulnerabilities.
- [ ] Security implications are described when applicable.

## Commit Style

Use short, imperative commit messages:

```text
Add policy sync tests
Fix SSRF URL parsing
Document dashboard API
```

## Security-Sensitive Changes

For changes touching `src/policy`, `src/proxy`, `src/security`, or `src/audit`, include:

- What risk the change addresses.
- What behavior is blocked, warned, or allowed.
- How failure is handled.
- Which tests prove the behavior.

Report private vulnerabilities through the process in [SECURITY.md](SECURITY.md).
