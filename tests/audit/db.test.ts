import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WardenDatabase } from "../../src/audit/db.js";

describe("WardenDatabase", () => {
  let db: WardenDatabase;
  let tempDir: string;

  beforeEach(() => {
    WardenDatabase.resetInstance();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-test-"));
    db = new WardenDatabase(path.join(tempDir, "test.db"));
    db.open();
  });

  afterEach(() => {
    db.close();
    WardenDatabase.resetInstance();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates DB file on open", () => {
    expect(fs.existsSync(path.join(tempDir, "test.db"))).toBe(true);
  });

  it("enables WAL mode", () => {
    const result = db.getDb().pragma("journal_mode")[0] as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");
  });

  it("enables foreign keys", () => {
    const result = db.getDb().pragma("foreign_keys")[0] as { foreign_keys: number };
    expect(result.foreign_keys).toBe(1);
  });

  it("creates audit_logs table", () => {
    const table = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='audit_logs'")
      .get();
    expect(table).toBeDefined();
  });

  it("creates rate_limits table", () => {
    const table = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rate_limits'")
      .get();
    expect(table).toBeDefined();
  });

  it("creates known_tools table", () => {
    const table = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='known_tools'")
      .get();
    expect(table).toBeDefined();
  });

  it("creates indexes on audit_logs", () => {
    const indexes = db
      .getDb()
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='audit_logs'")
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_audit_logs_timestamp");
    expect(names).toContain("idx_audit_logs_server");
    expect(names).toContain("idx_audit_logs_tool");
    expect(names).toContain("idx_audit_logs_blocked");
  });

  it("sets schema version to 2", () => {
    const row = db.getDb().prepare("SELECT value FROM schema_meta WHERE key = 'version'").get() as {
      value: string;
    };
    expect(row.value).toBe("2");
  });

  it("prepare() returns a statement", () => {
    const stmt = db.prepare("SELECT 1");
    expect(stmt).toBeDefined();
    expect(stmt.get()).toEqual({ "1": 1 });
  });

  it("transaction() wraps operations atomically", () => {
    const result = db.transaction(() => {
      db.prepare(
        "INSERT INTO audit_logs (id, timestamp, server, tool, input) VALUES (?, ?, ?, ?, ?)",
      ).run("test-1", new Date().toISOString(), "test-server", "test-tool", "{}");
      return "done";
    });
    expect(result).toBe("done");
    const row = db.prepare("SELECT COUNT(*) as count FROM audit_logs").get() as { count: number };
    expect(row.count).toBe(1);
  });

  it("singleton returns same instance", () => {
    const instance1 = WardenDatabase.getInstance(path.join(tempDir, "singleton.db"));
    instance1.open();
    const instance2 = WardenDatabase.getInstance();
    expect(instance1).toBe(instance2);
    instance1.close();
    WardenDatabase.resetInstance();
  });

  it("close() releases the handle", () => {
    db.close();
    expect(() => db.getDb()).toThrow();
  });

  it("getPath() returns db path", () => {
    expect(db.getPath()).toBe(path.join(tempDir, "test.db"));
  });

  it("open() is idempotent", () => {
    db.open(); // should not throw
    db.open(); // should not throw
  });
});
