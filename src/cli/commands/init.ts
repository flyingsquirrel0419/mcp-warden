import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { ConfigManager } from "../../utils/ConfigManager.js";
import { StdioTransport } from "../../proxy/StdioTransport.js";

interface McpServerConfig {
  command: string;
  args?: string[];
}

interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

export function registerInitCommand(program: Command): void {
  program
    .command("init")
    .description("Initialize warden by wrapping existing MCP client configurations")
    .action(() => {
      const configs = ConfigManager.findMcpConfigs();

      if (configs.length === 0) {
        process.stdout.write("No MCP client configurations found.\n");
        process.stdout.write("Supported types: claude-desktop, cursor, mcp-json\n");
        return;
      }

      for (const config of configs) {
        const content = fs.readFileSync(config.path, "utf-8");
        const parsed: McpConfigFile = JSON.parse(content);

        if (!parsed.mcpServers || Object.keys(parsed.mcpServers).length === 0) {
          continue;
        }

        // Backup original (only if backup doesn't exist)
        const backupPath = config.path + ".backup";
        if (!fs.existsSync(backupPath)) {
          fs.writeFileSync(backupPath, content, "utf-8");
        }

        let wrappedCount = 0;
        for (const [serverName, serverConfig] of Object.entries(parsed.mcpServers)) {
          // Skip if already wrapped
          if (serverConfig.command === "warden") {
            continue;
          }

          const originalCommand = StdioTransport.stringifyTarget(
            serverConfig.command,
            serverConfig.args ?? [],
          );

          parsed.mcpServers[serverName] = {
            command: "warden",
            args: ["proxy", "--target", originalCommand, "--name", serverName],
          };
          wrappedCount++;
        }

        fs.writeFileSync(config.path, JSON.stringify(parsed, null, 2) + "\n", "utf-8");

        const filename = path.basename(config.path);
        process.stdout.write(`Wrapped ${wrappedCount} servers in ${filename} (${config.type})\n`);
      }
    });
}
