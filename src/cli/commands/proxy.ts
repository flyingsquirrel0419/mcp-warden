import type { Command } from "commander";
import { startProxy } from "../../proxy/McpProxy.js";
import { ProxyError } from "../../utils/errors.js";

export function registerProxyCommand(program: Command): void {
  program
    .command("proxy")
    .description("Start proxying an MCP server through warden")
    .requiredOption("-t, --target <command>", "the MCP server command to proxy")
    .option("-n, --name <name>", "server display name", "mcp-server")
    .option("-p, --policy <path>", "path to policy.yaml")
    .option("-w, --watch-policy", "watch policy file for changes")
    .action(
      async (options: { target: string; name: string; policy?: string; watchPolicy?: boolean }) => {
        try {
          await startProxy(options.target, {
            serverName: options.name,
            policyPath: options.policy,
            watchPolicy: options.watchPolicy,
          });
        } catch (err) {
          if (err instanceof ProxyError) {
            process.stderr.write(`Proxy error: ${err.message}\n`);
            process.exit(1);
          } else {
            const message = err instanceof Error ? err.message : String(err);
            process.stderr.write(`Error: ${message}\n`);
            process.exit(2);
          }
        }
      },
    );
}
