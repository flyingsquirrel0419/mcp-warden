import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const sha256 = process.env.WARDEN_CLI_TARBALL_SHA256;

if (!sha256) {
  throw new Error("WARDEN_CLI_TARBALL_SHA256 is required");
}

const formula = `class WardenCli < Formula
  desc "Local-first security gateway for MCP servers"
  homepage "https://github.com/flyingsquirrel0419/warden-cli"
  url "https://github.com/flyingsquirrel0419/warden-cli/releases/download/v${version}/warden-cli.tgz"
  sha256 "${sha256}"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args, "--omit=dev"
  end

  test do
    assert_match "${version}", shell_output("#{bin}/warden --version")
  end
end
`;

fs.mkdirSync("release", { recursive: true });
fs.writeFileSync("release/warden-cli.rb", formula);
