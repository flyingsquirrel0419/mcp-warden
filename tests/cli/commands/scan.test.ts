import { describe, it, expect } from "vitest";
import {
  assessToolRisk,
  calculateRiskScore,
  formatScanResult,
} from "../../../src/cli/commands/scan.js";
import type { ToolRisk, ScanResult } from "../../../src/cli/commands/scan.js";
import { createProgram } from "../../../src/cli/index.js";

describe("assessToolRisk", () => {
  it("classifies read_file as low risk", () => {
    const result = assessToolRisk("read_file", "reads files from filesystem");
    expect(result.riskLevel).toBe("low");
    expect(result.name).toBe("read_file");
    expect(result.description).toBe("reads files from filesystem");
  });

  it("classifies exec_command as high risk", () => {
    const result = assessToolRisk("exec_command", "executes shell commands");
    expect(result.riskLevel).toBe("high");
    expect(result.riskFactors).toContain("code execution");
  });

  it("classifies send_http_request as high risk", () => {
    const result = assessToolRisk("send_http_request", "makes HTTP requests to URLs");
    expect(result.riskLevel).toBe("high");
    expect(result.riskFactors).toContain("network access");
  });

  it("classifies write_file as medium risk", () => {
    const result = assessToolRisk("write_file", "writes content to a file");
    expect(result.riskLevel).toBe("medium");
    expect(result.riskFactors).toContain("filesystem mutation");
  });

  it("classifies unknown tool with no keywords as low risk", () => {
    const result = assessToolRisk("transform_data", "applies a transformation");
    expect(result.riskLevel).toBe("low");
    expect(result.riskFactors).toEqual([]);
  });

  it("escalates risk when description contains 'arbitrary'", () => {
    const result = assessToolRisk("process_data", "processes arbitrary input data");
    expect(result.riskLevel).toBe("medium");
    expect(result.riskFactors).toContain("unrestricted scope");
  });

  it("escalates medium to high when description contains 'any'", () => {
    const result = assessToolRisk("modify_file", "modifies any file on disk");
    expect(result.riskLevel).toBe("high");
  });

  it("detects filesystem access for directory tools", () => {
    const result = assessToolRisk("list_directory", "lists files in a directory");
    expect(result.riskFactors).toContain("filesystem access");
  });

  it("picks highest risk level when multiple keywords match", () => {
    const result = assessToolRisk("exec_shell_command", "executes commands in bash shell");
    expect(result.riskLevel).toBe("high");
    expect(result.riskFactors).toContain("code execution");
  });
});

describe("calculateRiskScore", () => {
  it("returns base score for empty tools", () => {
    expect(calculateRiskScore([])).toBe(1.0);
  });

  it("keeps all-low tools under 3", () => {
    const tools: ToolRisk[] = [
      { name: "read_a", description: "", riskLevel: "low", riskFactors: [] },
      { name: "read_b", description: "", riskLevel: "low", riskFactors: [] },
      { name: "read_c", description: "", riskLevel: "low", riskFactors: [] },
    ];
    const score = calculateRiskScore(tools);
    expect(score).toBeLessThan(3);
  });

  it("calculates correct score for mixed tools", () => {
    const tools: ToolRisk[] = [
      { name: "read", description: "", riskLevel: "low", riskFactors: [] },
      { name: "write", description: "", riskLevel: "medium", riskFactors: [] },
      { name: "exec", description: "", riskLevel: "high", riskFactors: [] },
    ];
    const score = calculateRiskScore(tools);
    // 1.0 + 0.1 + 0.7 + 1.5 = 3.3
    expect(score).toBe(3.3);
  });

  it("clamps score to 10 max", () => {
    const tools: ToolRisk[] = Array.from({ length: 10 }, (_, i) => ({
      name: `exec_${i}`,
      description: "",
      riskLevel: "high" as const,
      riskFactors: [],
    }));
    // 1.0 + 10 * 1.5 = 16.0 → clamped to 10
    const score = calculateRiskScore(tools);
    expect(score).toBe(10);
  });

  it("rounds score to one decimal", () => {
    const tools: ToolRisk[] = [
      { name: "a", description: "", riskLevel: "medium", riskFactors: [] },
    ];
    // 1.0 + 0.7 = 1.7
    const score = calculateRiskScore(tools);
    expect(score).toBe(1.7);
  });
});

describe("formatScanResult", () => {
  it("produces expected output format", () => {
    const result: ScanResult = {
      serverCommand: "npx @some/server",
      tools: [
        {
          name: "read_file",
          description: "reads files",
          riskLevel: "low",
          riskFactors: ["read-only access"],
        },
        {
          name: "exec_cmd",
          description: "runs commands",
          riskLevel: "high",
          riskFactors: ["code execution"],
        },
      ],
      riskScore: 2.6,
      networkAccess: false,
      fileSystemAccess: true,
      executionAccess: true,
      recommendation: "Moderate risk. Review tools before enabling.",
    };

    const output = formatScanResult(result);

    expect(output).toContain("Scan Results for npx @some/server");
    expect(output).toContain("Tools exposed: 2");
    expect(output).toContain("✅ read_file");
    expect(output).toContain("❌ exec_cmd");
    expect(output).toContain("Network access: NO");
    expect(output).toContain("File system access: YES");
    expect(output).toContain("Execution access: YES");
    expect(output).toContain("Risk score: 2.6 / 10");
    expect(output).toContain("Moderate risk. Review tools before enabling.");
  });

  it("shows ⚠️  for medium-risk tools", () => {
    const result: ScanResult = {
      serverCommand: "test-server",
      tools: [
        {
          name: "write_file",
          description: "writes files",
          riskLevel: "medium",
          riskFactors: ["filesystem mutation"],
        },
      ],
      riskScore: 1.7,
      networkAccess: false,
      fileSystemAccess: true,
      executionAccess: false,
      recommendation: "Low risk. Safe to use.",
    };

    const output = formatScanResult(result);
    expect(output).toContain("⚠️  write_file");
  });
});

describe("CLI scan command registration", () => {
  it("has scan command registered", () => {
    const program = createProgram();
    const cmds = program.commands.map((c) => c.name());
    expect(cmds).toContain("scan");
  });

  it("scan command requires --target option", () => {
    const program = createProgram();
    const scanCmd = program.commands.find((c) => c.name() === "scan");
    expect(scanCmd).toBeDefined();
    const targetOpt = scanCmd!.options.find((o) => o.long === "--target");
    expect(targetOpt).toBeDefined();
  });
});
