import fs from "node:fs";

const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = pkg.version;
const sha256 = process.env.MCP_WARDEN_TARBALL_SHA256;

if (!sha256) {
  throw new Error("MCP_WARDEN_TARBALL_SHA256 is required");
}

const formula = `class McpWarden < Formula
  desc "Local-first security gateway for MCP servers"
  homepage "https://github.com/flyingsquirrel0419/mcp-warden"
  url "https://github.com/flyingsquirrel0419/mcp-warden/releases/download/v${version}/mcp-warden.tgz"
  sha256 "${sha256}"
  license "Apache-2.0"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args, "--omit=dev"
  end

  test do
    assert_match "${version}", shell_output("#{bin}/mcp-warden --version")
  end
end
`;

fs.mkdirSync("release", { recursive: true });
fs.writeFileSync("release/mcp-warden.rb", formula);
