import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";

describe("CLI discover command registration", () => {
  it("has discover command registered", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("discover");
  });

  it("discover command has --json option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "discover");
    expect(cmd).toBeDefined();
    const jsonOpt = cmd!.options.find((o) => o.long === "--json");
    expect(jsonOpt).toBeDefined();
  });

  it("discover command has --wrap option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "discover");
    expect(cmd).toBeDefined();
    const wrapOpt = cmd!.options.find((o) => o.long === "--wrap");
    expect(wrapOpt).toBeDefined();
  });
});

describe("CLI policy command registration", () => {
  it("has policy command registered", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("policy");
  });

  it("policy has sync subcommand", () => {
    const program = createProgram();
    const policyCmd = program.commands.find((c) => c.name() === "policy");
    expect(policyCmd).toBeDefined();
    const subcmds = policyCmd!.commands.map((c) => c.name());
    expect(subcmds).toContain("sync");
  });

  it("policy has list subcommand", () => {
    const program = createProgram();
    const policyCmd = program.commands.find((c) => c.name() === "policy");
    const subcmds = policyCmd!.commands.map((c) => c.name());
    expect(subcmds).toContain("list");
  });

  it("policy has apply subcommand", () => {
    const program = createProgram();
    const policyCmd = program.commands.find((c) => c.name() === "policy");
    const subcmds = policyCmd!.commands.map((c) => c.name());
    expect(subcmds).toContain("apply");
  });

  it("policy sync has --repo option", () => {
    const program = createProgram();
    const policyCmd = program.commands.find((c) => c.name() === "policy");
    const syncCmd = policyCmd!.commands.find((c) => c.name() === "sync");
    expect(syncCmd).toBeDefined();
    const repoOpt = syncCmd!.options.find((o) => o.long === "--repo");
    expect(repoOpt).toBeDefined();
  });
});
