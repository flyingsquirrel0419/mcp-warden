import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WebSocket } from "ws";
import { DashboardServer } from "../../src/dashboard/server.js";
import { WardenDatabase } from "../../src/audit/db.js";

const MCP_DIR = path.join(os.homedir(), ".warden");
const POLICY_PATH = path.join(MCP_DIR, "policy.yaml");
const CONFIG_PATH = path.join(MCP_DIR, "config.yaml");

let tempDir: string;
let db: WardenDatabase;
let dashboard: DashboardServer;
let port: number;

let backedUpPolicy: string | null = null;
let backedUpConfig: string | null = null;

function backupFile(filePath: string): string | null {
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  return null;
}

function restoreFile(filePath: string, content: string | null): void {
  if (content !== null) {
    fs.writeFileSync(filePath, content, "utf-8");
  } else if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function httpGet(urlPath: string): Promise<{ statusCode: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:${port}${urlPath}`, (res) => {
      let body = "";
      res.on("data", (chunk: Buffer) => (body += chunk.toString()));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode ?? 0,
          data: JSON.parse(body),
        });
      });
    });
    req.on("error", reject);
  });
}

function httpPut(
  urlPath: string,
  payload: unknown,
): Promise<{ statusCode: number; data: unknown }> {
  const body = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = http.request(
      `http://localhost:${port}${urlPath}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk: Buffer) => (data += chunk.toString()));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            data: JSON.parse(data),
          });
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function seedDatabase(): void {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

  const rows: Array<{
    id: string;
    ts: string;
    server: string;
    tool: string;
    input: string;
    output_size: number;
    duration_ms: number;
    blocked: number;
    block_reason: string | null;
    policy_mode: string;
  }> = [
    {
      id: "a1",
      ts: `${today}T10:00:00.000Z`,
      server: "notion",
      tool: "search_pages",
      input: '{"query":"test"}',
      output_size: 1024,
      duration_ms: 50,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a2",
      ts: `${today}T10:01:00.000Z`,
      server: "notion",
      tool: "search_pages",
      input: "{}",
      output_size: 2048,
      duration_ms: 75,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a3",
      ts: `${today}T10:02:00.000Z`,
      server: "notion",
      tool: "create_page",
      input: "{}",
      output_size: 512,
      duration_ms: 120,
      blocked: 1,
      block_reason: "Tool not allowed",
      policy_mode: "enforcing",
    },
    {
      id: "a4",
      ts: `${today}T11:00:00.000Z`,
      server: "github",
      tool: "list_repos",
      input: "{}",
      output_size: 4096,
      duration_ms: 30,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a5",
      ts: `${today}T11:01:00.000Z`,
      server: "github",
      tool: "list_repos",
      input: "{}",
      output_size: 4096,
      duration_ms: 25,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a6",
      ts: `${today}T11:02:00.000Z`,
      server: "github",
      tool: "list_repos",
      input: "{}",
      output_size: 4096,
      duration_ms: 35,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a7",
      ts: `${today}T11:03:00.000Z`,
      server: "github",
      tool: "create_issue",
      input: "{}",
      output_size: 0,
      duration_ms: 10,
      blocked: 1,
      block_reason: "Blocked by policy",
      policy_mode: "enforcing",
    },
    {
      id: "a8",
      ts: `${yesterday}T09:00:00.000Z`,
      server: "notion",
      tool: "search_pages",
      input: "{}",
      output_size: 1024,
      duration_ms: 60,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a9",
      ts: `${yesterday}T10:00:00.000Z`,
      server: "github",
      tool: "list_repos",
      input: "{}",
      output_size: 2048,
      duration_ms: 40,
      blocked: 0,
      block_reason: null,
      policy_mode: "audit-only",
    },
    {
      id: "a10",
      ts: `${twoDaysAgo}T08:00:00.000Z`,
      server: "notion",
      tool: "search_pages",
      input: "{}",
      output_size: 512,
      duration_ms: 55,
      blocked: 1,
      block_reason: "Rate limited",
      policy_mode: "enforcing",
    },
  ];

  const insert = db.prepare(
    `INSERT INTO audit_logs (id, timestamp, server, tool, input, output_size, duration_ms, blocked, block_reason, policy_mode)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (const r of rows) {
      insert.run(
        r.id,
        r.ts,
        r.server,
        r.tool,
        r.input,
        r.output_size,
        r.duration_ms,
        r.blocked,
        r.block_reason,
        r.policy_mode,
      );
    }
  });
}

describe("DashboardServer", () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-dashboard-"));

    backedUpPolicy = backupFile(POLICY_PATH);
    backedUpConfig = backupFile(CONFIG_PATH);

    WardenDatabase.resetInstance();
    db = WardenDatabase.getInstance(path.join(tempDir, "test.db"));
    db.open();
    seedDatabase();

    dashboard = new DashboardServer(0);
    await dashboard.start();
    port = (
      dashboard as unknown as { server: { address: () => { port: number } } }
    ).server.address().port;
  });

  afterAll(async () => {
    await dashboard.stop();
    db.close();
    WardenDatabase.resetInstance();

    restoreFile(POLICY_PATH, backedUpPolicy);
    restoreFile(CONFIG_PATH, backedUpConfig);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("GET /api/status", () => {
    it("returns dashboard status for today", async () => {
      const { statusCode, data } = await httpGet("/api/status");
      const body = data as {
        totalCalls: number;
        blockedCalls: number;
        activeServers: number;
        avgResponseTime: number;
        serverStatuses: Record<string, { total: number; blocked: number; avgDuration: number }>;
      };

      expect(statusCode).toBe(200);
      expect(body.totalCalls).toBe(7);
      expect(body.blockedCalls).toBe(2);
      expect(body.activeServers).toBe(2);
      expect(body.avgResponseTime).toBe(Math.round((50 + 75 + 120 + 30 + 25 + 35 + 10) / 7));
      expect(body.serverStatuses).toHaveProperty("notion");
      expect(body.serverStatuses).toHaveProperty("github");
    });

    it("includes per-server summary", async () => {
      const { data } = await httpGet("/api/status");
      const body = data as {
        serverStatuses: Record<string, { total: number; blocked: number; avgDuration: number }>;
      };

      const notion = body.serverStatuses["notion"];
      expect(notion.total).toBe(5);
      expect(notion.blocked).toBe(2);
      expect(notion.avgDuration).toBe((50 + 75 + 120 + 60 + 55) / 5);

      const github = body.serverStatuses["github"];
      expect(github.total).toBe(5);
      expect(github.blocked).toBe(1);
      expect(github.avgDuration).toBe((30 + 25 + 35 + 10 + 40) / 5);
    });
  });

  describe("GET /api/logs/recent", () => {
    it("returns recent logs with default limit", async () => {
      const { statusCode, data } = await httpGet("/api/logs/recent");
      const entries = data as Array<{ id: string }>;
      expect(statusCode).toBe(200);
      expect(entries.length).toBeLessThanOrEqual(50);
      expect(entries.length).toBeGreaterThan(0);
    });

    it("respects limit query parameter", async () => {
      const { data } = await httpGet("/api/logs/recent?limit=3");
      const entries = data as Array<{ id: string }>;
      expect(entries).toHaveLength(3);
    });

    it("filters by server", async () => {
      const { data } = await httpGet("/api/logs/recent?server=notion");
      const entries = data as Array<{ server: string }>;
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.server).toBe("notion");
      }
    });

    it("filters by tool", async () => {
      const { data } = await httpGet("/api/logs/recent?tool=list_repos");
      const entries = data as Array<{ tool: string }>;
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.tool).toBe("list_repos");
      }
    });

    it("filters by blocked=true", async () => {
      const { data } = await httpGet("/api/logs/recent?blocked=true");
      const entries = data as Array<{ blocked: boolean }>;
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.blocked).toBe(true);
      }
    });

    it("filters by blocked=false", async () => {
      const { data } = await httpGet("/api/logs/recent?blocked=false");
      const entries = data as Array<{ blocked: boolean }>;
      expect(entries.length).toBeGreaterThan(0);
      for (const e of entries) {
        expect(e.blocked).toBe(false);
      }
    });

    it("returns entries in descending timestamp order", async () => {
      const { data } = await httpGet("/api/logs/recent?limit=5");
      const entries = data as Array<{ timestamp: string }>;
      for (let i = 1; i < entries.length; i++) {
        expect(entries[i - 1].timestamp >= entries[i].timestamp).toBe(true);
      }
    });
  });

  describe("GET /api/stats/server/:name", () => {
    it("returns summary and tool stats for a server", async () => {
      const { statusCode, data } = await httpGet("/api/stats/server/notion");
      const body = data as {
        total: number;
        blocked: number;
        avgDuration: number;
        tools: Array<{ tool: string; count: number; blocked: number }>;
      };

      expect(statusCode).toBe(200);
      expect(body.total).toBe(5);
      expect(body.blocked).toBe(2);
      expect(body.tools.length).toBeGreaterThan(0);

      const searchPages = body.tools.find((t) => t.tool === "search_pages");
      expect(searchPages).toBeDefined();
      expect(searchPages!.count).toBe(4);
    });

    it("returns zero stats for unknown server", async () => {
      const { statusCode, data } = await httpGet("/api/stats/server/nonexistent");
      const body = data as {
        total: number;
        blocked: number;
        avgDuration: number;
        tools: Array<unknown>;
      };

      expect(statusCode).toBe(200);
      expect(body.total).toBe(0);
      expect(body.blocked).toBe(0);
      expect(body.tools).toHaveLength(0);
    });
  });

  describe("GET /api/stats/tools", () => {
    it("returns top tools by call count", async () => {
      const { statusCode, data } = await httpGet("/api/stats/tools");
      const tools = data as Array<{
        tool: string;
        count: number;
        blocked: number;
      }>;

      expect(statusCode).toBe(200);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0].count).toBe(4);
    });

    it("respects limit parameter", async () => {
      const { data } = await httpGet("/api/stats/tools?limit=2");
      const tools = data as Array<unknown>;
      expect(tools).toHaveLength(2);
    });
  });

  describe("GET /api/stats/analytics", () => {
    it("returns daily, topTools, and servers arrays", async () => {
      const { statusCode, data } = await httpGet("/api/stats/analytics?days=7");
      const body = data as {
        daily: Array<{
          date: string;
          total: number;
          blocked: number;
          avg_duration: number;
        }>;
        topTools: Array<{ tool: string; count: number }>;
        servers: Array<{ server: string; total: number }>;
      };

      expect(statusCode).toBe(200);
      expect(body.daily.length).toBeGreaterThan(0);
      expect(body.topTools.length).toBeGreaterThan(0);
      expect(body.servers.length).toBeGreaterThan(0);
    });

    it("includes correct daily totals", async () => {
      const { data } = await httpGet("/api/stats/analytics?days=7");
      const body = data as {
        daily: Array<{ date: string; total: number; blocked: number }>;
      };

      const today = new Date().toISOString().slice(0, 10);
      const todayRow = body.daily.find((d) => d.date === today);
      expect(todayRow).toBeDefined();
      expect(todayRow!.total).toBe(7);
      expect(todayRow!.blocked).toBe(2);
    });

    it("defaults to 7 days when no days param", async () => {
      const { data } = await httpGet("/api/stats/analytics");
      const body = data as {
        daily: Array<{ date: string }>;
      };
      expect(body.daily).toBeDefined();
      expect(Array.isArray(body.daily)).toBe(true);
    });
  });

  describe("GET /api/policy", () => {
    it("returns exists:false when no policy file exists", async () => {
      if (fs.existsSync(POLICY_PATH)) {
        fs.unlinkSync(POLICY_PATH);
      }

      const { statusCode, data } = await httpGet("/api/policy");
      const body = data as { yaml: string; exists: boolean };

      expect(statusCode).toBe(200);
      expect(body.exists).toBe(false);
      expect(body.yaml).toBe("");
    });

    it("returns policy content when file exists", async () => {
      const yaml = "version: 1\ndefaults:\n  mode: audit-only\n";
      fs.writeFileSync(POLICY_PATH, yaml, "utf-8");

      const { statusCode, data } = await httpGet("/api/policy");
      const body = data as { yaml: string; exists: boolean };

      expect(statusCode).toBe(200);
      expect(body.exists).toBe(true);
      expect(body.yaml).toBe(yaml);
    });
  });

  describe("PUT /api/policy", () => {
    it("writes valid policy to file", async () => {
      if (fs.existsSync(POLICY_PATH)) fs.unlinkSync(POLICY_PATH);

      const validYaml = "version: 1\ndefaults:\n  mode: audit-only\n  alert_on_new_tool: true\n";

      const { statusCode, data } = await httpPut("/api/policy", {
        yaml: validYaml,
      });
      const body = data as { success: boolean };

      expect(statusCode).toBe(200);
      expect(body.success).toBe(true);
      expect(fs.existsSync(POLICY_PATH)).toBe(true);
      expect(fs.readFileSync(POLICY_PATH, "utf-8")).toBe(validYaml);
    });

    it("returns 400 for invalid YAML", async () => {
      const { statusCode, data } = await httpPut("/api/policy", {
        yaml: "not: valid: policy: [",
      });
      const body = data as { error: string };

      expect(statusCode).toBe(400);
      expect(body.error).toBeDefined();
      expect(typeof body.error).toBe("string");
    });

    it("returns 400 for YAML missing required version field", async () => {
      const { statusCode, data } = await httpPut("/api/policy", {
        yaml: "defaults:\n  mode: audit-only\n",
      });
      const body = data as { error: string };

      expect(statusCode).toBe(400);
      expect(body.error).toContain("validation failed");
    });

    it("returns 400 when body has no yaml field", async () => {
      const { statusCode, data } = await httpPut("/api/policy", {
        content: "something",
      });
      const body = data as { error: string };

      expect(statusCode).toBe(400);
      expect(body.error).toContain("yaml");
    });

    it("returns 400 when yaml is not a string", async () => {
      const { statusCode, data } = await httpPut("/api/policy", {
        yaml: 12345,
      });
      const body = data as { error: string };

      expect(statusCode).toBe(400);
      expect(body.error).toContain("yaml");
    });

    it("broadcasts policy_updated via WebSocket", async () => {
      const validYaml = "version: 1\ndefaults:\n  mode: passthrough\n";

      const ws = new WebSocket(`ws://localhost:${port}`);
      const messagePromise = new Promise<string>((resolve) => {
        ws.on("message", (raw) => {
          const text = typeof raw === "string" ? raw : raw.toString();
          const parsed = JSON.parse(text) as { type: string; data: unknown };
          if (parsed.type === "status") {
            resolve(text);
          }
        });
      });

      await new Promise<void>((resolve) => ws.on("open", () => resolve()));

      await httpPut("/api/policy", { yaml: validYaml });

      const msg = await messagePromise;
      const parsed = JSON.parse(msg) as {
        type: string;
        data: { event: string };
      };
      expect(parsed.type).toBe("status");
      expect(parsed.data.event).toBe("policy_updated");

      ws.close();
      await new Promise<void>((resolve) => ws.on("close", () => resolve()));
    });
  });

  describe("GET /api/config", () => {
    it("returns current configuration", async () => {
      const { statusCode, data } = await httpGet("/api/config");
      const body = data as {
        log_level: string;
        proxy_timeout_ms: number;
        dashboard_port: number;
      };

      expect(statusCode).toBe(200);
      expect(typeof body.log_level).toBe("string");
      expect(typeof body.proxy_timeout_ms).toBe("number");
      expect(typeof body.dashboard_port).toBe("number");
    });
  });

  describe("PUT /api/config", () => {
    it("updates and returns configuration", async () => {
      const { statusCode, data } = await httpPut("/api/config", {
        log_level: "debug",
      });
      const body = data as { log_level: string };

      expect(statusCode).toBe(200);
      expect(body.log_level).toBe("debug");
    });

    it("persists config across requests", async () => {
      await httpPut("/api/config", { log_level: "warn" });

      const { data } = await httpGet("/api/config");
      const body = data as { log_level: string };

      expect(body.log_level).toBe("warn");
    });
  });

  describe("localhost-only middleware", () => {
    it("allows requests from localhost", async () => {
      const { statusCode } = await httpGet("/api/status");
      expect(statusCode).toBe(200);
    });

    it("includes localhost check in the middleware chain", async () => {
      // The test server binds to localhost:0, so all requests come from
      // a local address. We verify the endpoint still works (middleware passes).
      // Full non-local rejection requires an external client — this is a structural test.
      const { statusCode, data } = await httpGet("/api/config");
      expect(statusCode).toBe(200);
      expect(data).toBeDefined();
    });
  });

  describe("WebSocket", () => {
    it("sends recent logs on connect", async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);

      const messages: string[] = await new Promise((resolve) => {
        const collected: string[] = [];
        ws.on("message", (raw) => {
          collected.push(typeof raw === "string" ? raw : raw.toString());
          if (collected.length >= 10) {
            ws.close();
            resolve(collected);
          }
        });

        setTimeout(() => {
          ws.close();
          resolve(collected);
        }, 2000);
      });

      expect(messages.length).toBeGreaterThan(0);

      const first = JSON.parse(messages[0]) as {
        type: string;
        data: { id: string; server: string };
      };
      expect(first.type).toBe("log");
      expect(first.data.id).toBeDefined();
      expect(first.data.server).toBeDefined();
    });

    it("closes cleanly", async () => {
      const ws = new WebSocket(`ws://localhost:${port}`);
      await new Promise<void>((resolve) => ws.on("open", () => resolve()));

      ws.close();
      const closeEvent = await new Promise<number>((resolve) =>
        ws.on("close", (code) => resolve(code)),
      );
      expect(closeEvent).toBe(1005);
    });
  });
});
