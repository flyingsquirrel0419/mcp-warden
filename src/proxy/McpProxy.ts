import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import fs from "node:fs";
import { PolicyEngine } from "../policy/PolicyEngine.js";
import { PolicyLoader } from "../policy/PolicyLoader.js";
import { RateLimiter } from "../policy/RateLimiter.js";
import { AuditLogger } from "../audit/AuditLogger.js";
import { WardenDatabase } from "../audit/db.js";
import { ConfigManager } from "../utils/ConfigManager.js";
import { Logger } from "../utils/logger.js";
import { HandshakeManager } from "./HandshakeManager.js";
import { RequestHandler } from "./RequestHandler.js";
import { NotificationRelay } from "./NotificationRelay.js";
import { StdioTransport } from "./StdioTransport.js";
import { HttpTransport } from "./HttpTransport.js";
import { ProxyError } from "../utils/errors.js";
import { InjectionDetector } from "../security/InjectionDetector.js";
import { SsrfGuard } from "../security/SsrfGuard.js";
import { DataLeakDetector } from "../security/DataLeakDetector.js";
import { Notifier } from "../daemon/Notifier.js";
import { VERSION } from "../version.js";

export interface ProxyConfig {
  target: string;
  serverName: string;
  policyPath?: string;
  watchPolicy?: boolean;
}

export class McpProxy {
  private client: Client | null = null;
  private server: Server | null = null;
  private policyEngine: PolicyEngine | null = null;
  private auditLogger: AuditLogger | null = null;
  private db: WardenDatabase | null = null;
  private logger: Logger;
  private config: ProxyConfig;
  private fsWatcher: ReturnType<typeof fs.watch> | null = null;

  constructor(config: ProxyConfig) {
    this.config = config;
    this.logger = new Logger({ console: false }).child("proxy");
  }

  async start(): Promise<void> {
    this.logger.info("Starting MCP Warden proxy", { server: this.config.serverName });

    // 1. Initialize Database
    const dbPath = ConfigManager.getDbPath();
    this.db = WardenDatabase.getInstance(dbPath);
    this.db.open();

    // 2. Create AuditLogger
    this.auditLogger = new AuditLogger(this.db);

    // 3. Load policy → create PolicyEngine + RateLimiter
    const policyPath = this.config.policyPath ?? ConfigManager.getPolicyPath();
    let policy: ReturnType<typeof PolicyLoader.defaultPolicy>;
    try {
      policy = PolicyLoader.loadFromFile(policyPath);
      this.logger.info("Policy loaded", { path: policyPath });
    } catch {
      policy = PolicyLoader.defaultPolicy();
      this.logger.info("Using default policy (audit-only)");
    }
    const rateLimiter = new RateLimiter(this.db);
    this.policyEngine = new PolicyEngine(policy, rateLimiter);

    // 4. Create Client + Transport (connect to upstream)
    const isHttp = HttpTransport.isHttpTarget(this.config.target);
    this.client = new Client({ name: "mcp-warden", version: VERSION }, { capabilities: {} });

    try {
      if (HttpTransport.isHttpTarget(this.config.target)) {
        const httpConfig = HttpTransport.parseTarget(this.config.target);
        if (!httpConfig) throw new ProxyError("Invalid HTTP target", this.config.serverName);
        await this.client.connect(HttpTransport.createTransport(httpConfig));
      } else {
        const transportConfig = StdioTransport.parseTarget(this.config.target);
        await this.client.connect(
          new StdioClientTransport({
            command: transportConfig.command,
            args: transportConfig.args,
          }),
        );
      }
    } catch (err) {
      if (err instanceof ProxyError) throw err;
      throw new ProxyError(
        `Failed to connect to upstream MCP server: ${this.config.target}`,
        this.config.serverName,
        err instanceof Error ? err : undefined,
      );
    }

    // 5. Get upstream capabilities
    const upstreamCapabilities = this.client.getServerCapabilities() ?? {};
    const capabilities = HandshakeManager.transformCapabilities(upstreamCapabilities);

    // 6. Create Server + StdioServerTransport
    this.server = new Server({ name: this.config.serverName, version: VERSION }, { capabilities });

    // 7. Wire notification relay
    NotificationRelay.wire(this.client, this.server, upstreamCapabilities);

    // 8. Register request handlers
    RequestHandler.registerHandlers({
      client: this.client,
      server: this.server,
      serverName: this.config.serverName,
      policyEngine: this.policyEngine,
      auditLogger: this.auditLogger,
      capabilities,
      requestTimeout: isHttp ? 30000 : StdioTransport.parseTarget(this.config.target).timeout,
      injectionDetector: new InjectionDetector(),
      ssrfGuard: new SsrfGuard(),
      dataLeakDetector: new DataLeakDetector(),
      notifier: new Notifier({ channels: ["log"], minSeverity: "info" }),
    });

    // 9. Connect server to stdio (AI client talks to us)
    await this.server.connect(new StdioServerTransport());

    this.logger.info("Proxy ready", { server: this.config.serverName });

    // 10. Policy hot-reload
    if (this.config.watchPolicy) {
      this.watchPolicyFile(policyPath);
    }
  }

  async stop(): Promise<void> {
    await this.cleanup();
  }

  private watchPolicyFile(policyPath: string): void {
    try {
      if (!fs.existsSync(policyPath)) return;
      this.fsWatcher = fs.watch(policyPath, (eventType) => {
        if (eventType === "change" && this.policyEngine) {
          try {
            const newPolicy = PolicyLoader.loadFromFile(policyPath);
            this.policyEngine.reload(newPolicy);
            this.logger.info("Policy reloaded", { path: policyPath });
          } catch (err) {
            this.logger.warn("Failed to reload policy", {
              error: err instanceof Error ? err.message : String(err),
            });
          }
        }
      });
    } catch {
      // fs.watch not supported or file doesn't exist
    }
  }

  private async cleanup(): Promise<void> {
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    if (this.auditLogger) {
      await this.auditLogger.flush();
    }
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    this.logger.info("Proxy stopped", { server: this.config.serverName });
  }
}

export async function startProxy(
  target: string,
  options?: { serverName?: string; policyPath?: string; watchPolicy?: boolean },
): Promise<void> {
  const proxy = new McpProxy({
    target,
    serverName: options?.serverName ?? "mcp-server",
    policyPath: options?.policyPath,
    watchPolicy: options?.watchPolicy,
  });

  const cleanup = async () => {
    await proxy.stop();
    process.exit(0);
  };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);

  await proxy.start();
}
