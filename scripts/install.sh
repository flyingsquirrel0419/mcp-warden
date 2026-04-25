#!/usr/bin/env sh
set -eu

REPO="flyingsquirrel0419/warden-cli"
PACKAGE_NAME="warden-cli.tgz"

if ! command -v curl >/dev/null 2>&1; then
  echo "warden installer requires curl." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "warden installer requires npm and Node.js >= 20." >&2
  exit 1
fi

VERSION="${WARDEN_CLI_VERSION:-latest}"

if [ "$VERSION" = "latest" ]; then
  URL="https://github.com/${REPO}/releases/latest/download/${PACKAGE_NAME}"
else
  VERSION="${VERSION#v}"
  URL="https://github.com/${REPO}/releases/download/v${VERSION}/${PACKAGE_NAME}"
fi

echo "Installing warden from ${URL}"
npm install -g "${URL}"

if command -v warden >/dev/null 2>&1; then
  warden --version
else
  echo "warden installed, but the executable was not found on PATH." >&2
  exit 1
fi
