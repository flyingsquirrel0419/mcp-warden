import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PolicyLoader } from "../../src/policy/PolicyLoader.js";
import { ConfigError } from "../../src/utils/errors.js";

describe("PolicyLoader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-policy-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const validYaml = `
version: 1
defaults:
  mode: enforcing
  alert_on_new_tool: false
servers:
  notion:
    mode: enforcing
    allowed_tools:
      - search_pages
      - get_page
    rate_limit:
      per_minute: 20
      per_day: 500
  github:
    mode: audit-only
    allowed_tools: "*"
    blocked_tools:
      - delete_repository
    rules:
      - name: "block-sensitive"
        match:
          tool: create_issue
          input:
            title:
              pattern: "password|secret"
        action: block
        message: "Sensitive data detected"
`;

  it("loads valid YAML from string", () => {
    const policy = PolicyLoader.loadFromString(validYaml);
    expect(policy.defaults.mode).toBe("enforcing");
    expect(policy.servers.size).toBe(2);
  });

  it("loads valid YAML from file", () => {
    const filePath = path.join(tempDir, "policy.yaml");
    fs.writeFileSync(filePath, validYaml);
    const policy = PolicyLoader.loadFromFile(filePath);
    expect(policy.servers.has("notion")).toBe(true);
    expect(policy.servers.has("github")).toBe(true);
  });

  it("rejects invalid YAML structure", () => {
    expect(() => PolicyLoader.loadFromString("version: 2")).toThrow(ConfigError);
  });

  it("rejects missing version", () => {
    expect(() => PolicyLoader.loadFromString("defaults: { mode: enforcing }")).toThrow(ConfigError);
  });

  it("pre-compiles regex patterns as RegExp objects", () => {
    const policy = PolicyLoader.loadFromString(validYaml);
    const github = policy.servers.get("github")!;
    expect(github.rules).toHaveLength(1);
    expect(github.rules[0].compiledPatterns).toBeInstanceOf(Map);
    expect(github.rules[0].compiledPatterns.get("title")).toBeInstanceOf(RegExp);
  });

  it("throws ConfigError for invalid regex", () => {
    const badYaml = `
version: 1
servers:
  test:
    rules:
      - name: "bad-regex"
        match:
          input:
            sql:
              pattern: "([invalid"
        action: block
`;
    expect(() => PolicyLoader.loadFromString(badYaml)).toThrow(ConfigError);
  });

  it("resolveForServer returns server-specific policy", () => {
    const policy = PolicyLoader.loadFromString(validYaml);
    const resolved = PolicyLoader.resolveForServer(policy, "notion");
    expect(resolved.mode).toBe("enforcing");
    expect(resolved.allowedTools).toBeInstanceOf(Set);
    expect(resolved.allowedTools!.has("search_pages")).toBe(true);
  });

  it("resolveForServer falls back to defaults", () => {
    const policy = PolicyLoader.loadFromString(validYaml);
    const resolved = PolicyLoader.resolveForServer(policy, "unknown-server");
    expect(resolved.mode).toBe("enforcing");
    expect(resolved.allowedTools).toBeNull();
  });

  it("allowed_tools: '*' results in null (wildcard)", () => {
    const policy = PolicyLoader.loadFromString(validYaml);
    const github = policy.servers.get("github")!;
    expect(github.allowedTools).toBeNull();
  });

  it("allowed_tools: array results in Set", () => {
    const policy = PolicyLoader.loadFromString(validYaml);
    const notion = policy.servers.get("notion")!;
    expect(notion.allowedTools).toBeInstanceOf(Set);
    expect(notion.allowedTools!.size).toBe(2);
  });

  it("missing policy file throws ConfigError", () => {
    expect(() => PolicyLoader.loadFromFile("/nonexistent/policy.yaml")).toThrow(ConfigError);
  });

  it("defaultPolicy returns audit-only with no servers", () => {
    const policy = PolicyLoader.defaultPolicy();
    expect(policy.defaults.mode).toBe("audit-only");
    expect(policy.defaults.alertOnNewTool).toBe(true);
    expect(policy.servers.size).toBe(0);
  });
});
