import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { WardenDatabase } from "../audit/db.js";
import { AuditLogger, type AuditQuery } from "../audit/AuditLogger.js";
import { ConfigManager } from "../utils/ConfigManager.js";
import { PolicyLoader } from "../policy/PolicyLoader.js";
import { Logger } from "../utils/logger.js";

interface WSMessage {
  type: "log" | "alert" | "status";
  data: unknown;
}

export class DashboardServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private db: WardenDatabase;
  private auditLogger: AuditLogger;
  private configManager: ConfigManager;
  private clients: Set<WebSocket>;
  private port: number;
  private logger: Logger;

  constructor(port?: number) {
    this.port = port ?? 4242;
    this.app = express();
    this.clients = new Set();
    this.logger = new Logger({ console: true });

    this.db = WardenDatabase.getInstance();
    this.db.open();
    this.auditLogger = new AuditLogger(this.db);
    this.configManager = new ConfigManager();
    this.configManager.load();

    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  private setupMiddleware(): void {
    this.app.use((req, res, next) => {
      const remoteAddr = req.socket.remoteAddress ?? "";
      const isLocal =
        remoteAddr === "127.0.0.1" ||
        remoteAddr === "::1" ||
        remoteAddr === "::ffff:127.0.0.1" ||
        remoteAddr === "localhost" ||
        remoteAddr === "";
      if (!isLocal) {
        res.status(403).json({ error: "Access denied: non-local origin" });
        return;
      }
      next();
    });
    this.app.use(express.json({ limit: "1mb" }));
    const publicDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "public");
    this.app.use(express.static(publicDir));
  }

  private setupRoutes(): void {
    this.app.get("/api/status", (_req, res) => {
      try {
        const today = new Date().toISOString().slice(0, 10);
        const todayStart = `${today}T00:00:00.000Z`;

        const query: AuditQuery = { from: todayStart, limit: 10000 };
        const todayEntries = this.auditLogger.query(query);

        const totalCalls = todayEntries.length;
        const blockedCalls = todayEntries.filter((e) => e.blocked).length;
        const servers = new Set(todayEntries.map((e) => e.server));
        const activeServers = servers.size;
        const avgResponseTime =
          totalCalls > 0
            ? Math.round(todayEntries.reduce((sum, e) => sum + e.duration_ms, 0) / totalCalls)
            : 0;

        const serverStatuses: Record<
          string,
          { total: number; blocked: number; avgDuration: number }
        > = {};
        for (const name of servers) {
          serverStatuses[name] = this.auditLogger.getServerSummary(name);
        }

        res.json({
          totalCalls,
          blockedCalls,
          activeServers,
          avgResponseTime,
          serverStatuses,
        });
      } catch {
        res.status(500).json({ error: "Failed to fetch status" });
      }
    });

    this.app.get("/api/logs/recent", (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 50;
        const server = req.query.server as string | undefined;
        const tool = req.query.tool as string | undefined;
        const blockedParam = req.query.blocked as string | undefined;
        const blocked =
          blockedParam === "true" ? true : blockedParam === "false" ? false : undefined;

        const query: AuditQuery = { limit, server, tool, blocked };
        const entries = this.auditLogger.query(query);
        res.json(entries);
      } catch {
        res.status(500).json({ error: "Failed to fetch logs" });
      }
    });

    this.app.get("/api/stats/server/:name", (req, res) => {
      try {
        const name = req.params.name;
        const summary = this.auditLogger.getServerSummary(name);
        const toolStats = this.auditLogger.getToolStats(name);
        res.json({ ...summary, tools: toolStats });
      } catch {
        res.status(500).json({ error: "Failed to fetch server stats" });
      }
    });

    this.app.get("/api/stats/tools", (req, res) => {
      try {
        const limit = parseInt(req.query.limit as string) || 10;
        const rows = this.db
          .prepare(
            "SELECT tool, COUNT(*) as count, SUM(blocked) as blocked FROM audit_logs GROUP BY tool ORDER BY count DESC LIMIT ?",
          )
          .all(limit) as Array<{
          tool: string;
          count: number;
          blocked: number;
        }>;
        res.json(rows);
      } catch {
        res.status(500).json({ error: "Failed to fetch tool stats" });
      }
    });

    this.app.get("/api/stats/analytics", (req, res) => {
      try {
        const days = parseInt(req.query.days as string) || 7;
        const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

        const dailyRows = this.db
          .prepare(
            `SELECT DATE(timestamp) as date, COUNT(*) as total, SUM(blocked) as blocked, AVG(duration_ms) as avg_duration
           FROM audit_logs WHERE timestamp >= ?
           GROUP BY DATE(timestamp) ORDER BY date ASC`,
          )
          .all(from) as Array<{
          date: string;
          total: number;
          blocked: number;
          avg_duration: number;
        }>;

        const topTools = this.db
          .prepare(
            `SELECT tool, COUNT(*) as count, SUM(blocked) as blocked, AVG(duration_ms) as avg_duration
           FROM audit_logs WHERE timestamp >= ?
           GROUP BY tool ORDER BY count DESC LIMIT 10`,
          )
          .all(from) as Array<{
          tool: string;
          count: number;
          blocked: number;
          avg_duration: number;
        }>;

        const serverRows = this.db
          .prepare(
            `SELECT server, COUNT(*) as total, SUM(blocked) as blocked, AVG(duration_ms) as avg_duration
           FROM audit_logs WHERE timestamp >= ?
           GROUP BY server ORDER BY total DESC`,
          )
          .all(from) as Array<{
          server: string;
          total: number;
          blocked: number;
          avg_duration: number;
        }>;

        res.json({ daily: dailyRows, topTools, servers: serverRows });
      } catch {
        res.status(500).json({ error: "Failed to fetch analytics" });
      }
    });

    this.app.get("/api/policy", (_req, res) => {
      try {
        const policyPath = this.configManager.get("policy_path") || ConfigManager.getPolicyPath();

        if (!fs.existsSync(policyPath)) {
          res.json({ yaml: "", exists: false });
          return;
        }

        const content = fs.readFileSync(policyPath, "utf-8");
        res.json({ yaml: content, exists: true });
      } catch {
        res.status(500).json({ error: "Failed to read policy" });
      }
    });

    this.app.put("/api/policy", (req, res) => {
      try {
        const { yaml: yamlContent } = req.body as { yaml: string };
        if (typeof yamlContent !== "string") {
          res.status(400).json({ error: "Request body must include 'yaml' string" });
          return;
        }

        PolicyLoader.loadFromString(yamlContent);

        const policyPath = this.configManager.get("policy_path") || ConfigManager.getPolicyPath();

        ConfigManager.ensureConfigDir();
        fs.writeFileSync(policyPath, yamlContent, "utf-8");

        res.json({ success: true });
        this.broadcast("status", { event: "policy_updated" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to update policy";
        res.status(400).json({ error: message });
      }
    });

    this.app.get("/api/config", (_req, res) => {
      try {
        const config = this.configManager.load();
        res.json(config);
      } catch {
        res.status(500).json({ error: "Failed to read config" });
      }
    });

    this.app.put("/api/config", (req, res) => {
      try {
        const updates = req.body as Record<string, unknown>;
        this.configManager.save(updates);
        const config = this.configManager.load();
        res.json(config);
      } catch {
        res.status(400).json({ error: "Failed to update config" });
      }
    });

    this.app.get("/{*path}", (_req, res) => {
      const publicDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), "public");
      const indexPath = path.join(publicDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Dashboard not found");
      }
    });
  }

  private setupWebSocket(): void {
    this.wss.on("connection", (ws) => {
      this.clients.add(ws);
      this.logger.info("Dashboard client connected");

      try {
        const recent = this.auditLogger.getRecent(10);
        for (const entry of recent) {
          this.sendToClient(ws, { type: "log", data: entry });
        }
      } catch {
        // empty db is fine
      }

      ws.on("close", () => {
        this.clients.delete(ws);
        this.logger.info("Dashboard client disconnected");
      });

      ws.on("error", () => {
        this.clients.delete(ws);
      });
    });
  }

  private sendToClient(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  broadcast(event: string, data: unknown): void {
    const message: WSMessage = { type: event as WSMessage["type"], data };
    const payload = JSON.stringify(message);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.on("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          reject(new Error(`Port ${this.port} is already in use`));
        } else {
          reject(err);
        }
      });

      this.server.listen(this.port, () => {
        this.logger.info(`Dashboard running at http://localhost:${this.port}`);
        resolve();
      });
    });
  }

  async stop(): Promise<void> {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    return new Promise((resolve, reject) => {
      this.wss.close((err) => {
        if (err) {
          reject(err);
        } else {
          this.server.close((serverErr) => {
            if (serverErr) {
              reject(serverErr);
            } else {
              this.logger.info("Dashboard stopped");
              resolve();
            }
          });
        }
      });
    });
  }
}
