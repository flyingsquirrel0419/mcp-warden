import { describe, it, expect } from "vitest";
import { createProgram } from "../../../src/cli/index.js";

describe("CLI", () => {
  it("creates program with correct name", () => {
    const program = createProgram();
    expect(program.name()).toBe("warden");
  });

  it("has proxy command", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("proxy");
  });

  it("has init command", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("init");
  });

  it("has status command", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("status");
  });

  it("has log command", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("log");
  });

  it("has version 1.0.0", () => {
    const program = createProgram();
    expect(program.version()).toBe("1.0.0");
  });
});
