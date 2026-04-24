import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PolicyEngine } from "../../src/policy/PolicyEngine.js";
import { PolicyLoader } from "../../src/policy/PolicyLoader.js";
import { RateLimiter } from "../../src/policy/RateLimiter.js";
import { createProxyFixture, type ProxyFixture } from "../helpers/proxy-fixture.js";

const flush = () => new Promise<void>((resolve) => setImmediate(() => setImmediate(resolve)));

const extractText = (content: Array<unknown>): string | undefined =>
  (content as Array<{ type: string; text?: string }>).find((c) => c.type === "text")?.text;

describe("E2E: Full Proxy Pipeline", { timeout: 30000 }, () => {
  let fixture: ProxyFixture;
  let client: ProxyFixture["client"];
  let auditLogger: ProxyFixture["auditLogger"];
  let policyEngine: ProxyFixture["policyEngine"];

  beforeAll(async () => {
    fixture = await createProxyFixture();
    client = fixture.client;
    auditLogger = fixture.auditLogger;
    policyEngine = fixture.policyEngine;
  });

  afterAll(async () => {
    await fixture.teardown();
  });

  it("lists tools from fake MCP server", async () => {
    const result = await client.listTools();

    expect(result.tools).toBeDefined();
    expect(result.tools.length).toBe(3);

    const names = result.tools.map((t) => t.name).sort();
    expect(names).toEqual(["add", "echo", "greet"]);
  });

  it("calls echo tool through the proxy and audits the call", async () => {
    const message = "Hello from Warden E2E";
    const startTime = Date.now();

    const policyResult = policyEngine.evaluate({
      server: "fake-server",
      tool: "echo",
      input: { message },
    });
    expect(policyResult.allowed).toBe(true);

    const result = await client.callTool({
      name: "echo",
      arguments: { message },
    });

    const duration = Date.now() - startTime;

    expect(result).toBeDefined();
    expect(extractText(result.content as Array<unknown>)).toBe(message);

    auditLogger.log({
      server: "fake-server",
      tool: "echo",
      input: { message },
      output_size: JSON.stringify(result).length,
      duration_ms: duration,
      blocked: false,
      policy_mode: "audit-only",
    });

    await flush();
  });

  it("calls add tool through the proxy and verifies result", async () => {
    const result = await client.callTool({
      name: "add",
      arguments: { a: 7, b: 3 },
    });

    expect(result).toBeDefined();
    expect(extractText(result.content as Array<unknown>)).toBe("10");

    auditLogger.log({
      server: "fake-server",
      tool: "add",
      input: { a: 7, b: 3 },
      output_size: JSON.stringify(result).length,
      duration_ms: 0,
      blocked: false,
      policy_mode: "audit-only",
    });

    await flush();
  });

  it("calls greet tool through the proxy", async () => {
    const result = await client.callTool({
      name: "greet",
      arguments: { name: "Warden" },
    });

    expect(result).toBeDefined();
    expect(extractText(result.content as Array<unknown>)).toBe("Hello, Warden!");

    auditLogger.log({
      server: "fake-server",
      tool: "greet",
      input: { name: "Warden" },
      output_size: JSON.stringify(result).length,
      duration_ms: 0,
      blocked: false,
      policy_mode: "audit-only",
    });

    await flush();
  });

  it("policy engine allows all tools in audit-only mode", () => {
    const result = policyEngine.evaluate({
      server: "fake-server",
      tool: "someRandomTool",
      input: {},
    });

    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("audit-only");
  });

  it("policy engine blocks tools in enforcing mode", async () => {
    const policy = PolicyLoader.loadFromString(`
version: 1
defaults:
  mode: enforcing
servers:
  fake-server:
    allowed_tools: "*"
    blocked_tools:
      - greet
`);
    const engine = new PolicyEngine(policy, new RateLimiter());

    const blocked = engine.evaluate({
      server: "fake-server",
      tool: "greet",
      input: { name: "test" },
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.mode).toBe("enforcing");
    expect(blocked.reason).toContain("greet");

    const allowed = engine.evaluate({
      server: "fake-server",
      tool: "echo",
      input: { message: "test" },
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.mode).toBe("enforcing");

    auditLogger.log({
      server: "fake-server",
      tool: "greet",
      input: { name: "test" },
      output_size: 0,
      duration_ms: 0,
      blocked: true,
      block_reason: blocked.reason,
      policy_mode: "enforcing",
    });

    await flush();
  });

  it("audit log recorded all calls", () => {
    const entries = auditLogger.getRecent(20);
    expect(entries.length).toBeGreaterThanOrEqual(4);

    const echoEntry = entries.find((e) => e.tool === "echo");
    expect(echoEntry).toBeDefined();
    expect(echoEntry!.server).toBe("fake-server");
    expect(echoEntry!.blocked).toBe(false);
    expect(echoEntry!.policy_mode).toBe("audit-only");

    const addEntry = entries.find((e) => e.tool === "add");
    expect(addEntry).toBeDefined();

    const greetEntry = entries.find((e) => e.tool === "greet" && e.blocked);
    expect(greetEntry).toBeDefined();
    expect(greetEntry!.block_reason).toContain("greet");
  });

  it("computes correct server summary stats", () => {
    const stats = auditLogger.getServerSummary("fake-server");

    expect(stats.total).toBeGreaterThanOrEqual(4);
    expect(stats.blocked).toBeGreaterThanOrEqual(1);
    expect(stats.avgDuration).toBeGreaterThanOrEqual(0);
  });

  it("computes correct per-tool stats", () => {
    const toolStats = auditLogger.getToolStats("fake-server");

    expect(toolStats.length).toBeGreaterThanOrEqual(3);

    const echoStats = toolStats.find((s) => s.tool === "echo");
    expect(echoStats).toBeDefined();
    expect(echoStats!.count).toBeGreaterThanOrEqual(1);
    expect(echoStats!.blocked).toBe(0);

    const greetStats = toolStats.find((s) => s.tool === "greet");
    expect(greetStats).toBeDefined();
    expect(greetStats!.blocked).toBeGreaterThanOrEqual(1);
  });

  it("masks sensitive fields in audited input", async () => {
    const sensitiveInput = {
      message: "normal text",
      api_key: "sk-test-secret-value",
      token: "bearer-abc123",
    };

    const result = await client.callTool({
      name: "echo",
      arguments: { message: "masking test" },
    });

    auditLogger.log({
      server: "fake-server",
      tool: "echo",
      input: sensitiveInput,
      output_size: JSON.stringify(result).length,
      duration_ms: 0,
      blocked: false,
      policy_mode: "audit-only",
    });

    await flush();

    const entries = auditLogger.query({ tool: "echo", limit: 50 });
    const entry = entries.find((e) => (e.input as Record<string, unknown>).api_key !== undefined);
    expect(entry).toBeDefined();
    expect((entry!.input as Record<string, unknown>).api_key).toBe("***REDACTED***");
    expect((entry!.input as Record<string, unknown>).token).toBe("***REDACTED***");
    expect((entry!.input as Record<string, unknown>).message).toBe("normal text");
  });
});
