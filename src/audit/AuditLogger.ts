import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { WardenDatabase } from "./db.js";
import { Masker } from "./Masker.js";

export interface AuditEntry {
  id: string;
  timestamp: string;
  server: string;
  tool: string;
  input: Record<string, unknown>;
  output_size: number;
  duration_ms: number;
  blocked: boolean;
  block_reason?: string;
  policy_mode: string;
}

export interface AuditQuery {
  server?: string;
  tool?: string;
  blocked?: boolean;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

export class AuditLogger {
  private db: WardenDatabase;
  private insertStmt: ReturnType<WardenDatabase["prepare"]> | null = null;
  private pendingWrites = new Set<Promise<void>>();

  constructor(db: WardenDatabase) {
    this.db = db;
  }

  private getInsertStmt() {
    if (!this.insertStmt) {
      this.insertStmt = this.db.prepare(
        `INSERT INTO audit_logs (id, timestamp, server, tool, input, output_size, duration_ms, blocked, block_reason, policy_mode)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
    }
    return this.insertStmt;
  }

  log(entry: Omit<AuditEntry, "id" | "timestamp">): void {
    const id = randomUUID();
    const timestamp = new Date().toISOString();
    const maskedInput = Masker.mask(entry.input);
    const inputJson = JSON.stringify(maskedInput);

    const write = new Promise<void>((resolve) => {
      setImmediate(() => {
        try {
          this.getInsertStmt().run(
            id,
            timestamp,
            entry.server,
            entry.tool,
            inputJson,
            entry.output_size,
            entry.duration_ms,
            entry.blocked ? 1 : 0,
            entry.block_reason ?? null,
            entry.policy_mode,
          );
        } catch (err) {
          this.insertStmt = null;
          process.stderr.write(`[AuditLogger] Failed to write audit log: ${err}\n`);
        } finally {
          resolve();
        }
      });
    });

    this.pendingWrites.add(write);
    write.finally(() => {
      this.pendingWrites.delete(write);
    });
  }

  async flush(): Promise<void> {
    while (this.pendingWrites.size > 0) {
      await Promise.allSettled([...this.pendingWrites]);
    }
  }

  query(filters: AuditQuery): AuditEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.server) {
      conditions.push("server = ?");
      params.push(filters.server);
    }
    if (filters.tool) {
      conditions.push("tool = ?");
      params.push(filters.tool);
    }
    if (filters.blocked !== undefined) {
      conditions.push("blocked = ?");
      params.push(filters.blocked ? 1 : 0);
    }
    if (filters.from) {
      conditions.push("timestamp >= ?");
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push("timestamp <= ?");
      params.push(filters.to);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    const rows = this.db
      .prepare(`SELECT * FROM audit_logs ${where} ORDER BY timestamp DESC LIMIT ? OFFSET ?`)
      .all(...params, limit, offset) as Array<Record<string, unknown>>;

    return rows.map((row) => this.rowToEntry(row));
  }

  getRecent(count: number): AuditEntry[] {
    const rows = this.db
      .prepare("SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT ?")
      .all(count) as Array<Record<string, unknown>>;
    return rows.map((row) => this.rowToEntry(row));
  }

  getServerSummary(server: string): { total: number; blocked: number; avgDuration: number } {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as total, SUM(blocked) as blocked, AVG(duration_ms) as avgDuration FROM audit_logs WHERE server = ?",
      )
      .get(server) as { total: number; blocked: number; avgDuration: number | null };
    return {
      total: row.total ?? 0,
      blocked: row.blocked ?? 0,
      avgDuration: row.avgDuration ?? 0,
    };
  }

  getToolStats(server: string): Array<{ tool: string; count: number; blocked: number }> {
    return this.db
      .prepare(
        "SELECT tool, COUNT(*) as count, SUM(blocked) as blocked FROM audit_logs WHERE server = ? GROUP BY tool ORDER BY count DESC",
      )
      .all(server) as Array<{ tool: string; count: number; blocked: number }>;
  }

  purgeOlderThan(days: number): number {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const result = this.db.prepare("DELETE FROM audit_logs WHERE timestamp <= ?").run(cutoff);
    return result.changes;
  }

  getDbSize(): number {
    try {
      const stat = fs.statSync(this.db.getPath());
      return stat.size;
    } catch {
      return 0;
    }
  }

  private rowToEntry(row: Record<string, unknown>): AuditEntry {
    return {
      id: row.id as string,
      timestamp: row.timestamp as string,
      server: row.server as string,
      tool: row.tool as string,
      input: JSON.parse(row.input as string),
      output_size: row.output_size as number,
      duration_ms: row.duration_ms as number,
      blocked: (row.blocked as number) === 1,
      block_reason: (row.block_reason as string) ?? undefined,
      policy_mode: row.policy_mode as string,
    };
  }
}
