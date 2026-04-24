import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { PolicySync } from "../../src/policy/PolicySync.js";

describe("PolicySync", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("repoDirName()", () => {
    it("extracts name from https URL", () => {
      const sync = new PolicySync(tmpDir);
      expect((sync as any).repoDirName("https://github.com/org/policies.git")).toBe("org_policies");
    });

    it("extracts name from SSH URL", () => {
      const sync = new PolicySync(tmpDir);
      expect((sync as any).repoDirName("git@github.com:org/policies.git")).toBe("org_policies");
    });

    it("handles URL without .git suffix", () => {
      const sync = new PolicySync(tmpDir);
      expect((sync as any).repoDirName("https://github.com/myteam/mcp-policies")).toBe(
        "myteam_mcp-policies",
      );
    });
  });

  describe("listPolicies()", () => {
    it("returns empty array when repo not synced", () => {
      const sync = new PolicySync(tmpDir);
      const policies = sync.listPolicies("https://github.com/nonexistent/repo.git");
      expect(policies).toEqual([]);
    });

    it("lists yaml files from a fake repo directory", () => {
      const sync = new PolicySync(tmpDir);
      const repoDir = path.join(tmpDir, "org_policies");
      fs.mkdirSync(repoDir, { recursive: true });
      fs.writeFileSync(
        path.join(repoDir, "strict.yaml"),
        "name: strict\ndescription: Strict policy\nversion: 1\ndefaults:\n  mode: enforcing\n",
      );
      fs.writeFileSync(
        path.join(repoDir, "readonly.yml"),
        "name: readonly\ndescription: Read-only policy\nversion: 1\ndefaults:\n  mode: audit-only\n",
      );

      const policies = sync.listPolicies("https://github.com/org/policies.git");
      expect(policies).toHaveLength(2);
      const names = policies.map((p) => p.name);
      expect(names).toContain("strict");
      expect(names).toContain("readonly");
    });

    it("skips .git directory", () => {
      const sync = new PolicySync(tmpDir);
      const repoDir = path.join(tmpDir, "org_policies");
      fs.mkdirSync(path.join(repoDir, ".git"), { recursive: true });
      fs.writeFileSync(path.join(repoDir, ".git", "config.yaml"), "some: git-config");
      fs.writeFileSync(
        path.join(repoDir, "policy.yaml"),
        "name: test\ndescription: Test\nversion: 1\ndefaults:\n  mode: passthrough\n",
      );

      const policies = sync.listPolicies("https://github.com/org/policies.git");
      expect(policies).toHaveLength(1);
      expect(policies[0].name).toBe("test");
    });
  });

  describe("applyPolicy()", () => {
    it("applies a valid policy file", () => {
      const sync = new PolicySync(tmpDir);
      const repoDir = path.join(tmpDir, "org_policies");
      fs.mkdirSync(repoDir, { recursive: true });

      const policyContent = "version: 1\ndefaults:\n  mode: audit-only\nservers: {}\n";
      fs.writeFileSync(path.join(repoDir, "safe.yaml"), policyContent);

      const configDir = path.join(tmpDir, "warden-home");
      const policyPath = path.join(configDir, "policy.yaml");
      fs.mkdirSync(configDir, { recursive: true });

      (sync as any).cacheDir = tmpDir;

      const result = sync.applyPolicy("https://github.com/org/policies.git", "safe.yaml");
      expect(result).toBeDefined();
    });

    it("throws on missing policy file", () => {
      const sync = new PolicySync(tmpDir);
      const repoDir = path.join(tmpDir, "org_policies");
      fs.mkdirSync(repoDir, { recursive: true });

      expect(() =>
        sync.applyPolicy("https://github.com/org/policies.git", "nonexistent.yaml"),
      ).toThrow();
    });
  });
});
