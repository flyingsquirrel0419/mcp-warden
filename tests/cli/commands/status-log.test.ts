import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Command } from "commander";
import { WardenDatabase } from "../../../src/audit/db.js";
import { registerStatusCommand } from "../../../src/cli/commands/status.js";
import { registerLogCommand } from "../../../src/cli/commands/log.js";
import { ConfigManager } from "../../../src/utils/ConfigManager.js";

interface SeedEntry {
  id: string;
  timestamp: string;
  server: string;
  tool: string;
  duration_ms?: number;
  blocked?: boolean;
  block_reason?: string;
}

function seedEntries(dbPath: string, entries: SeedEntry[]): void {
  const db = new WardenDatabase(dbPath);
  db.open();
  const stmt = db.prepare(
    `INSERT INTO audit_logs (id, timestamp, server, tool, input, output_size, duration_ms, blocked, block_reason, policy_mode)
     VALUES (?, ?, ?, ?, '{}', 0, ?, ?, ?, 'passthrough')`,
  );
  for (const e of entries) {
    stmt.run(
      e.id,
      e.timestamp,
      e.server,
      e.tool,
      e.duration_ms ?? 50,
      e.blocked ? 1 : 0,
      e.block_reason ?? null,
    );
  }
  db.close();
}

function collectOutput(spy: ReturnType<typeof vi.spyOn>): string {
  return (spy.mock.calls as string[][]).map((c) => c[0]).join("");
}

describe("status command", () => {
  let tempDir: string;
  let dbPath: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    WardenDatabase.resetInstance();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-status-"));
    dbPath = path.join(tempDir, "warden.db");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(ConfigManager, "getDbPath").mockReturnValue(dbPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    WardenDatabase.resetInstance();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerStatusCommand(program);
    return program;
  }

  it("shows message when DB file does not exist", async () => {
    await makeProgram().parseAsync(["node", "warden", "status"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toContain("No audit logs found");
    expect(out).toContain("Run a proxy first to generate logs");
  });

  it("shows recent entries with server/tool/duration/blocked status", async () => {
    seedEntries(dbPath, [
      {
        id: "1",
        timestamp: "2025-04-24T10:00:00.000Z",
        server: "notion",
        tool: "search",
        duration_ms: 50,
      },
      {
        id: "2",
        timestamp: "2025-04-24T10:01:00.000Z",
        server: "github",
        tool: "create_issue",
        duration_ms: 120,
      },
    ]);

    await makeProgram().parseAsync(["node", "warden", "status"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toContain("notion/search");
    expect(out).toContain("github/create_issue");
    expect(out).toContain("50ms");
    expect(out).toContain("120ms");
    expect(out).toContain("OK");
  });

  it("shows block_reason for blocked entries", async () => {
    seedEntries(dbPath, [
      {
        id: "1",
        timestamp: "2025-04-24T10:00:00.000Z",
        server: "notion",
        tool: "delete_page",
        duration_ms: 30,
        blocked: true,
        block_reason: "policy: tool not allowed",
      },
    ]);

    await makeProgram().parseAsync(["node", "warden", "status"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toContain("BLOCKED");
    expect(out).toContain("policy: tool not allowed");
  });

  it("shows message when DB has no entries", async () => {
    seedEntries(dbPath, []);

    await makeProgram().parseAsync(["node", "warden", "status"]);

    expect(collectOutput(stdoutSpy)).toContain("No audit log entries found");
  });
});

describe("log command", () => {
  let tempDir: string;
  let dbPath: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  const testEntries: SeedEntry[] = [
    {
      id: "1",
      timestamp: "2025-04-24T10:00:00.000Z",
      server: "notion",
      tool: "search",
      duration_ms: 50,
    },
    {
      id: "2",
      timestamp: "2025-04-24T10:01:00.000Z",
      server: "notion",
      tool: "get_page",
      duration_ms: 30,
    },
    {
      id: "3",
      timestamp: "2025-04-24T10:02:00.000Z",
      server: "github",
      tool: "create_issue",
      duration_ms: 120,
      blocked: true,
      block_reason: "not allowed",
    },
    {
      id: "4",
      timestamp: "2025-04-24T10:03:00.000Z",
      server: "filesystem",
      tool: "read_file",
      duration_ms: 10,
    },
  ];

  beforeEach(() => {
    WardenDatabase.resetInstance();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-log-"));
    dbPath = path.join(tempDir, "warden.db");
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    vi.spyOn(ConfigManager, "getDbPath").mockReturnValue(dbPath);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    WardenDatabase.resetInstance();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerLogCommand(program);
    return program;
  }

  it("filters by server name", async () => {
    seedEntries(dbPath, testEntries);

    await makeProgram().parseAsync(["node", "warden", "log", "--server", "notion"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toContain("notion/search");
    expect(out).toContain("notion/get_page");
    expect(out).not.toContain("github/");
    expect(out).not.toContain("filesystem/");
  });

  it("filters by blocked status", async () => {
    seedEntries(dbPath, testEntries);

    await makeProgram().parseAsync(["node", "warden", "log", "--blocked"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toContain("github/create_issue");
    expect(out).toContain("BLOCKED");
    expect(out).not.toContain("notion/search");
  });

  it("shows message when no entries match filters", async () => {
    seedEntries(dbPath, testEntries);

    await makeProgram().parseAsync(["node", "warden", "log", "--server", "nonexistent"]);

    expect(collectOutput(stdoutSpy)).toContain("No matching log entries found");
  });

  it("formats output as [timestamp] server/tool duration STATUS", async () => {
    seedEntries(dbPath, [
      {
        id: "1",
        timestamp: "2025-04-24T10:00:00.000Z",
        server: "notion",
        tool: "search",
        duration_ms: 50,
      },
    ]);

    await makeProgram().parseAsync(["node", "warden", "log"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toMatch(/\[2025-04-24T10:00:00\.000Z\] notion\/search 50ms OK/);
  });

  it("shows block_reason for blocked entries in log output", async () => {
    seedEntries(dbPath, [
      {
        id: "1",
        timestamp: "2025-04-24T10:00:00.000Z",
        server: "github",
        tool: "delete_repo",
        duration_ms: 30,
        blocked: true,
        block_reason: "dangerous operation",
      },
    ]);

    await makeProgram().parseAsync(["node", "warden", "log"]);

    const out = collectOutput(stdoutSpy);
    expect(out).toContain("BLOCKED");
    expect(out).toContain("dangerous operation");
  });

  it("respects --limit option", async () => {
    seedEntries(dbPath, [
      {
        id: "1",
        timestamp: "2025-04-24T10:00:00.000Z",
        server: "s1",
        tool: "t1",
      },
      {
        id: "2",
        timestamp: "2025-04-24T10:01:00.000Z",
        server: "s2",
        tool: "t2",
      },
      {
        id: "3",
        timestamp: "2025-04-24T10:02:00.000Z",
        server: "s3",
        tool: "t3",
      },
      {
        id: "4",
        timestamp: "2025-04-24T10:03:00.000Z",
        server: "s4",
        tool: "t4",
      },
    ]);

    await makeProgram().parseAsync(["node", "warden", "log", "--limit", "2"]);

    const out = collectOutput(stdoutSpy);
    const lines = out.split("\n").filter((l) => l.trim().startsWith("["));
    expect(lines).toHaveLength(2);
  });
});
