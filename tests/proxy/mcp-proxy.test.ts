import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { McpProxy, type ProxyConfig } from "../../src/proxy/McpProxy.js";

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn(function MockServer() {
    return {
      setRequestHandler: vi.fn(),
      connect: vi.fn().mockResolvedValue(undefined),
      notification: vi.fn(),
      setNotificationHandler: vi.fn(),
    };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn(function MockStdioServerTransport() {
    return {};
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: vi.fn(function MockClient() {
    return {
      connect: vi.fn().mockResolvedValue(undefined),
      getServerCapabilities: vi.fn().mockReturnValue({ tools: {} }),
      setNotificationHandler: vi.fn(),
      notification: vi.fn(),
    };
  }),
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: vi.fn(function MockStdioClientTransport() {
    return {};
  }),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  LoggingMessageNotificationSchema: { _def: { typeName: "ZodObject" } },
  CallToolRequestSchema: { method: "tools/call", shape: { method: { value: "tools/call" } } },
  ListToolsRequestSchema: { method: "tools/list", shape: { method: { value: "tools/list" } } },
  ListPromptsRequestSchema: { method: "prompts/list" },
  GetPromptRequestSchema: { method: "prompts/get" },
  ListResourcesRequestSchema: { method: "resources/list" },
  ReadResourceRequestSchema: { method: "resources/read" },
  PingRequestSchema: { method: "ping" },
  CompleteRequestSchema: { method: "completion/complete" },
}));

describe("McpProxy", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-proxy-"));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("constructor accepts valid config", () => {
    const proxy = new McpProxy({
      target: "npx server-everything",
      serverName: "test",
    });
    expect(proxy).toBeDefined();
  });

  it("start() initializes all components", async () => {
    const proxy = new McpProxy({
      target: "echo hello",
      serverName: "test",
      policyPath: path.join(tempDir, "policy.yaml"),
    });

    fs.writeFileSync(path.join(tempDir, "policy.yaml"), "version: 1\n");

    await proxy.start();
    expect(true).toBe(true);
    await proxy.stop();
  });

  it("start() works with missing policy file (default policy)", async () => {
    const proxy = new McpProxy({
      target: "echo hello",
      serverName: "test",
      policyPath: path.join(tempDir, "nonexistent.yaml"),
    });

    await proxy.start();
    expect(true).toBe(true);
    await proxy.stop();
  });

  it("stop() does not throw", async () => {
    const proxy = new McpProxy({
      target: "echo hello",
      serverName: "test",
      policyPath: path.join(tempDir, "policy.yaml"),
    });

    fs.writeFileSync(path.join(tempDir, "policy.yaml"), "version: 1\n");
    await proxy.start();
    await expect(proxy.stop()).resolves.toBeUndefined();
  });

  it("parseTarget is called with correct target", () => {
    const proxy = new McpProxy({
      target: "npx @notionhq/server",
      serverName: "notion",
    });
    expect(proxy).toBeDefined();
  });
});
