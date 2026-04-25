import { Command } from "commander";
import { registerProxyCommand } from "./commands/proxy.js";
import { registerInitCommand } from "./commands/init.js";
import { registerStatusCommand } from "./commands/status.js";
import { registerLogCommand } from "./commands/log.js";
import { registerScanCommand } from "./commands/scan.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerDiscoverCommand } from "./commands/discover.js";
import { registerPolicyCommand } from "./commands/policy.js";
import { VERSION } from "../version.js";

export function createProgram(): Command {
  const program = new Command();
  program
    .name("mcp-warden")
    .description("Local-first security gateway for MCP servers")
    .version(VERSION);
  registerProxyCommand(program);
  registerInitCommand(program);
  registerStatusCommand(program);
  registerLogCommand(program);
  registerScanCommand(program);
  registerDashboardCommand(program);
  registerDiscoverCommand(program);
  registerPolicyCommand(program);
  return program;
}
