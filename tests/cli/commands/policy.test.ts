import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createProgram } from "../../../src/cli/index.js";
import { PolicySync } from "../../../src/policy/PolicySync.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("CLI policy command", () => {
  it("has policy command with subcommands", () => {
    const program = createProgram();
    const policyCmd = program.commands.find((c) => c.name() === "policy");
    expect(policyCmd).toBeDefined();
    const subcmds = policyCmd!.commands.map((c) => c.name());
    expect(subcmds).toContain("sync");
    expect(subcmds).toContain("list");
    expect(subcmds).toContain("apply");
  });
});

describe("PolicySync getSyncUrl / setSyncUrl", () => {
  let tmpDir: string;
  let originalHome: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-cfg-"));
    originalHome = process.env.HOME ?? "";
    process.env.HOME = tmpDir;
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns null when no config file exists", () => {
    const sync = new PolicySync();
    expect(sync.getSyncUrl()).toBeNull();
  });

  it("persists and retrieves sync URL", () => {
    const sync = new PolicySync();
    sync.setSyncUrl("https://github.com/myteam/policies.git");
    expect(sync.getSyncUrl()).toBe("https://github.com/myteam/policies.git");
  });
});
