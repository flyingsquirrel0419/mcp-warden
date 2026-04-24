import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import { ConfigManager } from "../../utils/ConfigManager.js";

interface McpServerConfig {
  command: string;
  args?: string[];
  url?: string;
}

interface McpConfigFile {
  mcpServers?: Record<string, McpServerConfig>;
}

interface DiscoveredServer {
  name: string;
  config: McpServerConfig;
  sourcePath: string;
  sourceType: string;
  alreadyWrapped: boolean;
}

export function registerDiscoverCommand(program: Command): void {
  program
    .command("discover")
    .description("Discover MCP servers from all known configuration files")
    .option("--json", "Output as JSON instead of formatted text")
    .option("--wrap", "Automatically wrap all discovered servers with Warden")
    .action(async (options: { json?: boolean; wrap?: boolean }) => {
      const configs = ConfigManager.findMcpConfigs();

      if (configs.length === 0) {
        process.stdout.write("No MCP client configuration files found.\n");
        process.stdout.write("\nSearched for:\n");
        process.stdout.write(
          "  - Claude Desktop: ~/Library/Application Support/Claude/claude_desktop_config.json\n",
        );
        process.stdout.write(
          "  - Claude Desktop (Linux): ~/.config/Claude/claude_desktop_config.json\n",
        );
        process.stdout.write("  - Cursor: .cursor/mcp.json\n");
        process.stdout.write("  - MCP: .mcp.json\n");
        return;
      }

      const allServers: DiscoveredServer[] = [];

      for (const config of configs) {
        try {
          const content = fs.readFileSync(config.path, "utf-8");
          const parsed: McpConfigFile = JSON.parse(content);

          if (!parsed.mcpServers) continue;

          for (const [name, serverConfig] of Object.entries(parsed.mcpServers)) {
            allServers.push({
              name,
              config: serverConfig,
              sourcePath: config.path,
              sourceType: config.type,
              alreadyWrapped: serverConfig.command === "mcp-warden",
            });
          }
        } catch {
          // Skip unreadable / malformed configs
        }
      }

      if (allServers.length === 0) {
        process.stdout.write("Found configuration files but no MCP servers defined.\n");
        return;
      }

      if (options.json) {
        process.stdout.write(JSON.stringify(allServers, null, 2) + "\n");
        return;
      }

      // Group by source file
      const bySource = new Map<string, DiscoveredServer[]>();
      for (const server of allServers) {
        const key = server.sourcePath;
        if (!bySource.has(key)) bySource.set(key, []);
        bySource.get(key)!.push(server);
      }

      const totalServers = allServers.length;
      const wrappedCount = allServers.filter((s) => s.alreadyWrapped).length;
      const unwrappedCount = totalServers - wrappedCount;

      process.stdout.write(
        `\nFound ${totalServers} MCP server${totalServers !== 1 ? "s" : ""} across ${configs.length} config file${configs.length !== 1 ? "s" : ""}:\n\n`,
      );

      for (const [sourcePath, servers] of bySource) {
        const filename = path.basename(sourcePath);
        process.stdout.write(`  ${filename} (${servers[0].sourceType}):\n`);
        for (const server of servers) {
          const icon = server.alreadyWrapped ? "🛡️ " : "  ";
          const command = server.config.url
            ? server.config.url
            : [server.config.command, ...(server.config.args ?? [])].join(" ");
          const suffix = server.alreadyWrapped ? " (already wrapped)" : "";
          process.stdout.write(`  ${icon}${server.name}: ${command}${suffix}\n`);
        }
        process.stdout.write("\n");
      }

      if (unwrappedCount > 0) {
        process.stdout.write(`${wrappedCount} already wrapped, ${unwrappedCount} unwrapped.\n`);
      } else {
        process.stdout.write("All servers are already wrapped with Warden.\n");
      }

      // Auto-wrap mode
      if (options.wrap && unwrappedCount > 0) {
        process.stdout.write("\nWrapping servers with Warden...\n");

        for (const [sourcePath, servers] of bySource) {
          const content = fs.readFileSync(sourcePath, "utf-8");
          const parsed: McpConfigFile = JSON.parse(content);
          if (!parsed.mcpServers) continue;

          let wrapped = 0;
          for (const server of servers) {
            if (server.alreadyWrapped) continue;

            const entry = parsed.mcpServers[server.name];
            if (!entry) continue;

            const originalCommand = entry.url
              ? entry.url
              : [entry.command, ...(entry.args ?? [])].join(" ");

            parsed.mcpServers[server.name] = {
              command: "mcp-warden",
              args: ["proxy", "--target", originalCommand, "--name", server.name],
            };
            wrapped++;
          }

          if (wrapped > 0) {
            // Backup original
            const backupPath = sourcePath + ".backup";
            if (!fs.existsSync(backupPath)) {
              fs.writeFileSync(backupPath, content, "utf-8");
            }

            fs.writeFileSync(sourcePath, JSON.stringify(parsed, null, 2) + "\n", "utf-8");
            process.stdout.write(
              `  Wrapped ${wrapped} server(s) in ${path.basename(sourcePath)}\n`,
            );
          }
        }

        process.stdout.write("Done.\n");
      } else if (unwrappedCount > 0) {
        process.stdout.write("\nRun with --wrap to automatically wrap all servers with Warden.\n");
      }
    });
}
