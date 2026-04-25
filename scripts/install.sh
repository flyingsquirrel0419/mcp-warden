#!/usr/bin/env sh
set -eu

REPO="flyingsquirrel0419/mcp-warden"
PACKAGE_NAME="mcp-warden.tgz"

if ! command -v curl >/dev/null 2>&1; then
  echo "mcp-warden installer requires curl." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "mcp-warden installer requires npm and Node.js >= 20." >&2
  exit 1
fi

VERSION="${MCP_WARDEN_VERSION:-latest}"

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/${PACKAGE_NAME}"
else
  VERSION="${VERSION#v}"
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/${PACKAGE_NAME}"
fi

echo "Installing mcp-warden from ${URL}"
npm install -g "${URL}"

if command -v mcp-warden >/dev/null 2>&1; then
  mcp-warden --version
else
  echo "mcp-warden installed, but the executable was not found on PATH." >&2
  exit 1
fi
