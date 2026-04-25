# Release Guide

MCP Warden releases are created from git tags. Publishing is handled by GitHub Actions; do not publish manually unless the release workflow fails and the failure mode is understood.

## Release Channels

Each tag release produces:

- an npm package publish when `NPM_TOKEN` is configured;
- a GitHub Release with npm tarball assets;
- `install.sh` for curl-based installation;
- `mcp-warden.rb` for Homebrew formula installation;
- `checksums.txt` with SHA-256 hashes for release assets.

The npm publish step is optional. If `NPM_TOKEN` is not configured in repository secrets, the workflow logs a notice and still publishes the GitHub Release assets.

## Required Secret

| Secret      | Required | Purpose                                     |
| ----------- | -------- | ------------------------------------------- |
| `NPM_TOKEN` | No       | Publishes `mcp-warden` to the npm registry. |

No extra secret is required for GitHub Release assets because the workflow uses the repository `GITHUB_TOKEN`.

## Tag Format

Release tags must match the package version:

```text
v<package.json version>
```

For example, package version `1.0.0` must be released with tag `v1.0.0`. The release workflow fails if the tag and package version do not match.

## Release Steps

1. Update `package.json` and `package-lock.json`.
2. Move release notes from `Unreleased` to the version section in `CHANGELOG.md`.
3. Run local verification:

```bash
npm run format:check
npm run lint
npm test
npm run build
npm audit --audit-level=moderate
```

4. Commit and push the release prep changes.
5. Create and push the tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

6. Confirm the `Release` workflow completes.

## Install Commands

After the GitHub Release exists, users can install with any of these:

```bash
npm install -g mcp-warden
```

```bash
brew install --formula https://github.com/flyingsquirrel0419/mcp-warden/releases/latest/download/mcp-warden.rb
```

```bash
curl -fsSL https://github.com/flyingsquirrel0419/mcp-warden/releases/latest/download/install.sh | sh
```

For a pinned curl install:

```bash
MCP_WARDEN_VERSION=1.0.0 sh -c "$(curl -fsSL https://github.com/flyingsquirrel0419/mcp-warden/releases/latest/download/install.sh)"
```
