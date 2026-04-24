import type { Command } from "commander";
import fs from "node:fs";
import { WardenDatabase } from "../../audit/db.js";
import { AuditLogger } from "../../audit/AuditLogger.js";
import { ConfigManager } from "../../utils/ConfigManager.js";

export function registerStatusCommand(program: Command): void {
  program
    .command("status")
    .description("Show recent audit log entries and status")
    .action(() => {
      const dbPath = ConfigManager.getDbPath();

      if (!fs.existsSync(dbPath)) {
        process.stdout.write("No audit logs found. Run a proxy first to generate logs.\n");
        return;
      }

      let db: WardenDatabase | null = null;
      try {
        db = WardenDatabase.getInstance(dbPath);
        db.open();
        const logger = new AuditLogger(db);

        const recent = logger.getRecent(5);

        if (recent.length === 0) {
          process.stdout.write("No audit log entries found.\n");
          return;
        }

        for (const entry of recent) {
          const status = entry.blocked ? "BLOCKED" : "OK";
          const line = `[${entry.timestamp}] ${entry.server}/${entry.tool} ${entry.duration_ms}ms ${status}\n`;
          process.stdout.write(line);
          if (entry.blocked && entry.block_reason) {
            process.stdout.write(`  ${entry.block_reason}\n`);
          }
        }
      } finally {
        if (db) {
          db.close();
        }
        WardenDatabase.resetInstance();
      }
    });
}
