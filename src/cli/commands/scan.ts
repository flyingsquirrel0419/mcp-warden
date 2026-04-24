import type { Command } from "commander";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ToolRisk {
  name: string;
  description: string;
  riskLevel: "low" | "medium" | "high";
  riskFactors: string[];
}

export interface ScanResult {
  serverCommand: string;
  tools: ToolRisk[];
  riskScore: number;
  networkAccess: boolean;
  fileSystemAccess: boolean;
  executionAccess: boolean;
  recommendation: string;
}

const HIGH_KEYWORDS_EXEC = ["exec", "shell", "command", "run", "bash"];
const MEDIUM_KEYWORDS_MUTATION = ["write", "delete", "remove", "create", "modify"];
const HIGH_KEYWORDS_NETWORK = ["http", "fetch", "request", "url", "network", "api"];
const LOW_KEYWORDS_READONLY = ["read", "list", "get", "search", "find"];
const MEDIUM_KEYWORDS_FILESYSTEM = ["file", "path", "directory", "folder"];
const ESCALATION_WORDS = ["arbitrary", "any"];

function hasKeyword(text: string, keywords: string[]): boolean {
  const words = text.toLowerCase().split(/[\s_-]+/);
  return keywords.some((kw) => words.some((w) => w === kw));
}

export function assessToolRisk(name: string, description: string): ToolRisk {
  const riskFactors: string[] = [];
  const levels: Array<"low" | "medium" | "high"> = [];

  const combined = `${name} ${description}`;

  // Check execution keywords → HIGH
  if (hasKeyword(combined, HIGH_KEYWORDS_EXEC)) {
    levels.push("high");
    riskFactors.push("code execution");
  }

  // Check network keywords → HIGH
  if (hasKeyword(combined, HIGH_KEYWORDS_NETWORK)) {
    levels.push("high");
    riskFactors.push("network access");
  }

  // Check filesystem mutation keywords → MEDIUM
  if (hasKeyword(combined, MEDIUM_KEYWORDS_MUTATION)) {
    levels.push("medium");
    riskFactors.push("filesystem mutation");
  }

  // Check read-only keywords → LOW
  const hasReadonly = hasKeyword(combined, LOW_KEYWORDS_READONLY);

  if (hasReadonly) {
    levels.push("low");
    riskFactors.push("read-only access");
  }

  // Check filesystem access keywords → MEDIUM level, but only bump level when not read-only
  if (
    hasKeyword(combined, MEDIUM_KEYWORDS_FILESYSTEM) &&
    !riskFactors.includes("filesystem mutation")
  ) {
    riskFactors.push("filesystem access");
    if (!hasReadonly) {
      levels.push("medium");
    }
  }

  // Escalation: bump risk up one level if description contains "arbitrary" or "any"
  const shouldEscalate = ESCALATION_WORDS.some((w) => description.toLowerCase().includes(w));

  let riskLevel: "low" | "medium" | "high";
  if (levels.length === 0) {
    riskLevel = "low";
  } else {
    const levelOrder: Record<string, number> = { low: 0, medium: 1, high: 2 };
    const maxLevel = Math.max(...levels.map((l) => levelOrder[l]));
    riskLevel = (["low", "medium", "high"] as const)[maxLevel];
  }

  if (shouldEscalate && riskLevel === "low") {
    riskLevel = "medium";
    riskFactors.push("unrestricted scope");
  } else if (shouldEscalate && riskLevel === "medium") {
    riskLevel = "high";
    riskFactors.push("unrestricted scope");
  }

  return {
    name,
    description,
    riskLevel,
    riskFactors,
  };
}

export function calculateRiskScore(tools: ToolRisk[]): number {
  let score = 1.0;

  for (const tool of tools) {
    switch (tool.riskLevel) {
      case "high":
        score += 1.5;
        break;
      case "medium":
        score += 0.7;
        break;
      case "low":
        score += 0.1;
        break;
    }
  }

  return Math.min(Math.round(score * 10) / 10, 10);
}

function getRecommendation(score: number): string {
  if (score <= 3) {
    return "Low risk. Safe to use.";
  }
  if (score <= 5) {
    return "Moderate risk. Review tools before enabling.";
  }
  if (score <= 7) {
    return "High risk. Restrict with policy.";
  }
  return "Very high risk. Use with extreme caution.";
}

export function formatScanResult(result: ScanResult): string {
  const lines: string[] = [];

  lines.push(`Scan Results for ${result.serverCommand}`);
  lines.push(`Tools exposed: ${result.tools.length}`);

  for (const tool of result.tools) {
    const icon = tool.riskLevel === "low" ? "✅" : tool.riskLevel === "medium" ? "⚠️ " : "❌";
    const factors = tool.riskFactors.length > 0 ? ` (${tool.riskFactors.join(", ")})` : "";
    lines.push(`  ${icon} ${tool.name} - ${tool.description}${factors}`);
  }

  lines.push(
    `Network access: ${result.networkAccess ? "YES" : "NO"}`,
    `File system access: ${result.fileSystemAccess ? "YES" : "NO"}`,
    `Execution access: ${result.executionAccess ? "YES" : "NO"}`,
    `Risk score: ${result.riskScore.toFixed(1)} / 10`,
  );

  lines.push(result.recommendation);

  return lines.join("\n");
}

function parseCommand(target: string): { command: string; args: string[] } {
  const parts = target.split(/\s+/);
  return {
    command: parts[0],
    args: parts.slice(1),
  };
}

export function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan an MCP server for security risks before connecting")
    .requiredOption("-t, --target <command>", "Target MCP server command to scan")
    .option("--json", "Output as JSON instead of formatted text")
    .action(async (options: { target: string; json?: boolean }) => {
      const { target } = options;

      process.stdout.write(`Scanning ${target}...\n`);

      const { command, args } = parseCommand(target);
      const transport = new StdioClientTransport({ command, args });
      const client = new Client({ name: "mcp-warden-scanner", version: "0.1.0" });

      try {
        await client.connect(transport);
        const result = await client.listTools();

        const tools: ToolRisk[] = (result.tools ?? []).map((tool) =>
          assessToolRisk(tool.name, tool.description ?? ""),
        );

        const riskScore = calculateRiskScore(tools);
        const networkAccess = tools.some((t) => t.riskFactors.includes("network access"));
        const fileSystemAccess = tools.some(
          (t) =>
            t.riskFactors.includes("filesystem access") ||
            t.riskFactors.includes("filesystem mutation"),
        );
        const executionAccess = tools.some((t) => t.riskFactors.includes("code execution"));
        const recommendation = getRecommendation(riskScore);

        const scanResult: ScanResult = {
          serverCommand: target,
          tools,
          riskScore,
          networkAccess,
          fileSystemAccess,
          executionAccess,
          recommendation,
        };

        if (options.json) {
          process.stdout.write(JSON.stringify(scanResult, null, 2) + "\n");
        } else {
          process.stdout.write("\n" + formatScanResult(scanResult) + "\n");
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`Error scanning server: ${message}\n`);
        process.exit(1);
      } finally {
        await client.close();
      }
    });
}
