import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WardenDatabase } from "../../src/audit/db.js";
import { AuditLogger } from "../../src/audit/AuditLogger.js";

describe("AuditLogger", () => {
  let db: WardenDatabase;
  let logger: AuditLogger;
  let tempDir: string;

  beforeEach(() => {
    WardenDatabase.resetInstance();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-audit-"));
    db = new WardenDatabase(path.join(tempDir, "test.db"));
    db.open();
    logger = new AuditLogger(db);
  });

  afterEach(() => {
    db.close();
    WardenDatabase.resetInstance();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("creates an entry in the database", async () => {
    logger.log({
      server: "notion",
      tool: "search_pages",
      input: { query: "test" },
      output_size: 1024,
      duration_ms: 50,
      blocked: false,
      policy_mode: "audit-only",
    });
    await logger.flush();
    const entries = logger.getRecent(10);
    expect(entries).toHaveLength(1);
    expect(entries[0].server).toBe("notion");
    expect(entries[0].tool).toBe("search_pages");
  });

  it("generates UUID and ISO timestamp", async () => {
    logger.log({
      server: "test",
      tool: "test",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "passthrough",
    });
    await logger.flush();
    const entry = logger.getRecent(1)[0];
    expect(entry.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("masks sensitive input before storage", async () => {
    logger.log({
      server: "test",
      tool: "test",
      input: { api_key: "sk-secret123", name: "ok" },
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "passthrough",
    });
    await logger.flush();
    const entry = logger.getRecent(1)[0];
    expect(entry.input.api_key).toBe("***REDACTED***");
    expect(entry.input.name).toBe("ok");
  });

  it("does not throw on DB write failure", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    db.close();
    expect(() =>
      logger.log({
        server: "test",
        tool: "test",
        input: {},
        output_size: 0,
        duration_ms: 0,
        blocked: false,
        policy_mode: "passthrough",
      }),
    ).not.toThrow();
    await logger.flush();
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to write audit log"));
    stderrSpy.mockRestore();
  });

  it("flushes pending writes before the database is closed", async () => {
    logger.log({
      server: "test",
      tool: "before_close",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "audit-only",
    });

    await logger.flush();
    db.close();
    db.open();

    const entries = logger.query({ tool: "before_close" });
    expect(entries).toHaveLength(1);
  });

  it("queries with no filters", async () => {
    for (let i = 0; i < 3; i++) {
      logger.log({
        server: "test",
        tool: `tool${i}`,
        input: {},
        output_size: 0,
        duration_ms: 0,
        blocked: false,
        policy_mode: "passthrough",
      });
    }
    await logger.flush();
    const entries = logger.query({});
    expect(entries).toHaveLength(3);
  });

  it("queries with server filter", async () => {
    logger.log({
      server: "notion",
      tool: "a",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "p",
    });
    logger.log({
      server: "github",
      tool: "b",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "p",
    });
    await logger.flush();
    const entries = logger.query({ server: "notion" });
    expect(entries).toHaveLength(1);
    expect(entries[0].server).toBe("notion");
  });

  it("queries with date range", async () => {
    logger.log({
      server: "test",
      tool: "t",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "p",
    });
    await logger.flush();
    const entries = logger.query({ from: "2000-01-01", to: "2099-12-31" });
    expect(entries).toHaveLength(1);
  });

  it("queries with pagination", async () => {
    for (let i = 0; i < 5; i++) {
      logger.log({
        server: "test",
        tool: `t${i}`,
        input: {},
        output_size: 0,
        duration_ms: 0,
        blocked: false,
        policy_mode: "p",
      });
    }
    await logger.flush();
    const page1 = logger.query({ limit: 2, offset: 0 });
    const page2 = logger.query({ limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
  });

  it("getRecent returns last N entries", async () => {
    for (let i = 0; i < 10; i++) {
      logger.log({
        server: "test",
        tool: `t${i}`,
        input: {},
        output_size: 0,
        duration_ms: 0,
        blocked: false,
        policy_mode: "p",
      });
    }
    await logger.flush();
    const entries = logger.getRecent(3);
    expect(entries).toHaveLength(3);
  });

  it("getServerSummary calculates correct stats", async () => {
    logger.log({
      server: "notion",
      tool: "a",
      input: {},
      output_size: 0,
      duration_ms: 10,
      blocked: false,
      policy_mode: "p",
    });
    logger.log({
      server: "notion",
      tool: "b",
      input: {},
      output_size: 0,
      duration_ms: 30,
      blocked: true,
      block_reason: "not allowed",
      policy_mode: "p",
    });
    await logger.flush();
    const summary = logger.getServerSummary("notion");
    expect(summary.total).toBe(2);
    expect(summary.blocked).toBe(1);
    expect(summary.avgDuration).toBe(20);
  });

  it("getToolStats returns per-tool counts", async () => {
    logger.log({
      server: "test",
      tool: "a",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "p",
    });
    logger.log({
      server: "test",
      tool: "a",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: true,
      block_reason: "x",
      policy_mode: "p",
    });
    logger.log({
      server: "test",
      tool: "b",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "p",
    });
    await logger.flush();
    const stats = logger.getToolStats("test");
    expect(stats).toHaveLength(2);
    const toolA = stats.find((s) => s.tool === "a");
    expect(toolA?.count).toBe(2);
    expect(toolA?.blocked).toBe(1);
  });

  it("purgeOlderThan deletes old entries", async () => {
    logger.log({
      server: "test",
      tool: "t",
      input: {},
      output_size: 0,
      duration_ms: 0,
      blocked: false,
      policy_mode: "p",
    });
    await logger.flush();
    const deleted = logger.purgeOlderThan(0);
    expect(deleted).toBe(1);
    expect(logger.getRecent(10)).toHaveLength(0);
  });

  it("handles 100 rapid log calls", async () => {
    for (let i = 0; i < 100; i++) {
      logger.log({
        server: "test",
        tool: `t${i}`,
        input: {},
        output_size: 0,
        duration_ms: 0,
        blocked: false,
        policy_mode: "p",
      });
    }
    await logger.flush();
    const entries = logger.query({ limit: 200 });
    expect(entries).toHaveLength(100);
  });
});
