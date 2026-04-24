import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { PolicyEngine } from "../../src/policy/PolicyEngine.js";
import { PolicyLoader } from "../../src/policy/PolicyLoader.js";
import { RateLimiter } from "../../src/policy/RateLimiter.js";
import { AuditLogger } from "../../src/audit/AuditLogger.js";
import { WardenDatabase } from "../../src/audit/db.js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FAKE_SERVER_PATH = path.join(__dirname, "fake-mcp-server.ts");

export interface ProxyFixture {
  client: Client;
  db: WardenDatabase;
  auditLogger: AuditLogger;
  policyEngine: PolicyEngine;
  tmpDir: string;
  teardown: () => Promise<void>;
}

export async function createProxyFixture(options?: { policyYaml?: string }): Promise<ProxyFixture> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-fixture-"));
  const dbPath = path.join(tmpDir, "warden.db");

  const db = new WardenDatabase(dbPath);
  db.open();

  const auditLogger = new AuditLogger(db);

  let policy: ReturnType<typeof PolicyLoader.defaultPolicy>;
  if (options?.policyYaml) {
    const policyPath = path.join(tmpDir, "policy.yaml");
    fs.writeFileSync(policyPath, options.policyYaml, "utf-8");
    policy = PolicyLoader.loadFromFile(policyPath);
  } else {
    policy = PolicyLoader.defaultPolicy();
  }

  const rateLimiter = new RateLimiter();
  const policyEngine = new PolicyEngine(policy, rateLimiter);

  const client = new Client(
    { name: "warden-test-client", version: "1.0.0" },
    { capabilities: { tools: {} } },
  );

  await client.connect(
    new StdioClientTransport({
      command: "npx",
      args: ["tsx", FAKE_SERVER_PATH],
    }),
  );

  return {
    client,
    db,
    auditLogger,
    policyEngine,
    tmpDir,
    teardown: async () => {
      await client.close();
      db.close();
      WardenDatabase.resetInstance();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
  };
}
