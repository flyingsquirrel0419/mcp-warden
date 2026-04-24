import Database from "better-sqlite3";
import type BetterSqlite3 from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export class WardenDatabase {
  private db: BetterSqlite3.Database | null = null;
  private dbPath: string;
  private static instance: WardenDatabase | null = null;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? path.join(os.homedir(), ".mcp-warden", "warden.db");
  }

  static getInstance(dbPath?: string): WardenDatabase {
    if (!WardenDatabase.instance) {
      WardenDatabase.instance = new WardenDatabase(dbPath);
    }
    return WardenDatabase.instance;
  }

  static resetInstance(): void {
    if (WardenDatabase.instance) {
      WardenDatabase.instance.close();
      WardenDatabase.instance = null;
    }
  }

  open(): void {
    if (this.db) return;

    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    this.db = new Database(this.dbPath);
    this.configurePragmas();
    this.runMigrations();
    this.registerCleanup();
  }

  private configurePragmas(): void {
    const db = this.db!;
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");
    db.pragma("foreign_keys = ON");
    db.pragma("wal_autocheckpoint = 1000");
  }

  private runMigrations(): void {
    const db = this.db!;

    // Create schema_meta if not exists
    db.exec(`CREATE TABLE IF NOT EXISTS schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`);

    const storedVersion = this.getStoredVersion();
    const CURRENT_VERSION = 2;

    if (storedVersion < 1) {
      db.transaction(() => {
        db.exec(`CREATE TABLE IF NOT EXISTS audit_logs (
          id TEXT PRIMARY KEY,
          timestamp TEXT NOT NULL,
          server TEXT NOT NULL,
          tool TEXT NOT NULL,
          input TEXT NOT NULL DEFAULT '{}',
          output_size INTEGER NOT NULL DEFAULT 0,
          duration_ms REAL NOT NULL DEFAULT 0,
          blocked INTEGER NOT NULL DEFAULT 0,
          block_reason TEXT,
          policy_mode TEXT NOT NULL DEFAULT 'passthrough'
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_server ON audit_logs(server)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_tool ON audit_logs(tool)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_audit_logs_blocked ON audit_logs(blocked)`);
        db.exec(`CREATE TABLE IF NOT EXISTS rate_limits (
          server TEXT NOT NULL,
          window_start TEXT NOT NULL,
          window_type TEXT NOT NULL,
          call_count INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (server, window_start, window_type)
        )`);
        db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '1')").run();
      })();
    }

    if (storedVersion < 2) {
      db.transaction(() => {
        // Add known_tools tracking table
        db.exec(`CREATE TABLE IF NOT EXISTS known_tools (
          server TEXT NOT NULL,
          tool TEXT NOT NULL,
          first_seen TEXT NOT NULL,
          PRIMARY KEY (server, tool)
        )`);
        db.prepare("INSERT OR REPLACE INTO schema_meta (key, value) VALUES ('version', '2')").run();
      })();
    }

    void CURRENT_VERSION;
  }

  private getStoredVersion(): number {
    const row = this.db!.prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as
      | { value: string }
      | undefined;
    return row ? parseInt(row.value, 10) : 0;
  }

  private registerCleanup(): void {
    const cleanup = () => this.close();
    process.setMaxListeners(process.getMaxListeners() + 3);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(130);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(143);
    });
    process.on("exit", cleanup);
  }

  // Public API
  getDb(): BetterSqlite3.Database {
    if (!this.db) throw new Error("Database not initialized. Call open() first.");
    return this.db;
  }

  prepare(sql: string): BetterSqlite3.Statement {
    return this.getDb().prepare(sql);
  }

  transaction<T>(fn: () => T): T {
    return this.getDb().transaction(fn)();
  }

  close(): void {
    if (this.db) {
      try {
        this.db.pragma("wal_checkpoint(TRUNCATE)");
      } catch {
        /* ignore */
      }
      this.db.close();
      this.db = null;
    }
  }

  getPath(): string {
    return this.dbPath;
  }
}
