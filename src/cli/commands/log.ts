import type { Command } from "commander";
import type { AuditQuery } from "../../audit/AuditLogger.js";
import { WardenDatabase } from "../../audit/db.js";
import { AuditLogger } from "../../audit/AuditLogger.js";
import { ConfigManager } from "../../utils/ConfigManager.js";

export function registerLogCommand(program: Command): void {
  program
    .command("log")
    .description("Query and display audit logs")
    .option("-s, --server <name>", "filter by server")
    .option("-t, --tool <name>", "filter by tool")
    .option("-b, --blocked", "show only blocked")
    .option("-l, --limit <count>", "max entries to show", "20")
    .option("--tail", "stream new entries (polling every 1s)")
    .action(
      (options: {
        server?: string;
        tool?: string;
        blocked?: boolean;
        limit: string;
        tail?: boolean;
      }) => {
        const dbPath = ConfigManager.getDbPath();
        const db = WardenDatabase.getInstance(dbPath);
        db.open();
        const logger = new AuditLogger(db);

        try {
          if (options.tail) {
            let lastSeenCount = 0;

            const interval = setInterval(() => {
              const recent = logger.getRecent(parseInt(options.limit, 10));
              const newEntries = recent.slice(0, recent.length - lastSeenCount).reverse();
              for (const entry of newEntries) {
                const status = entry.blocked ? "BLOCKED" : "OK";
                process.stdout.write(
                  `[${entry.timestamp}] ${entry.server}/${entry.tool} ${entry.duration_ms}ms ${status}\n`,
                );
                if (entry.blocked && entry.block_reason) {
                  process.stdout.write(`  ${entry.block_reason}\n`);
                }
              }
              lastSeenCount = recent.length;
            }, 1000);

            process.on("SIGINT", () => {
              clearInterval(interval);
              db.close();
              WardenDatabase.resetInstance();
              process.exit(0);
            });

            return;
          }

          const filters: AuditQuery = {
            server: options.server,
            tool: options.tool,
            blocked: options.blocked,
            limit: parseInt(options.limit, 10),
          };

          const entries = logger.query(filters);

          if (entries.length === 0) {
            process.stdout.write("No matching log entries found.\n");
            return;
          }

          for (const entry of entries) {
            const status = entry.blocked ? "BLOCKED" : "OK";
            process.stdout.write(
              `[${entry.timestamp}] ${entry.server}/${entry.tool} ${entry.duration_ms}ms ${status}\n`,
            );
            if (entry.blocked && entry.block_reason) {
              process.stdout.write(`  ${entry.block_reason}\n`);
            }
          }
        } finally {
          if (!options.tail) {
            db.close();
            WardenDatabase.resetInstance();
          }
        }
      },
    );
}
