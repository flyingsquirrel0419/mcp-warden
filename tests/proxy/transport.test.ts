import { describe, it, expect } from "vitest";
import { StdioTransport } from "../../src/proxy/StdioTransport.js";
import { HandshakeManager } from "../../src/proxy/HandshakeManager.js";
import { NotificationRelay } from "../../src/proxy/NotificationRelay.js";

describe("StdioTransport", () => {
  describe("parseTarget()", () => {
    it("parses single command", () => {
      const result = StdioTransport.parseTarget("node");
      expect(result.command).toBe("node");
      expect(result.args).toEqual([]);
    });

    it("parses command with args", () => {
      const result = StdioTransport.parseTarget("npx @notionhq/notion-mcp-server");
      expect(result.command).toBe("npx");
      expect(result.args).toEqual(["@notionhq/notion-mcp-server"]);
    });

    it("parses command with multiple args", () => {
      const result = StdioTransport.parseTarget("node server.js --port 3000");
      expect(result.command).toBe("node");
      expect(result.args).toEqual(["server.js", "--port", "3000"]);
    });

    it("handles quoted args", () => {
      const result = StdioTransport.parseTarget('npx "@scope/server" --arg');
      expect(result.command).toBe("npx");
      expect(result.args).toEqual(["@scope/server", "--arg"]);
    });

    it("throws on empty string", () => {
      expect(() => StdioTransport.parseTarget("")).toThrow();
    });

    it("sets default timeout", () => {
      const result = StdioTransport.parseTarget("node server.js");
      expect(result.timeout).toBe(30000);
    });
  });
});

describe("HandshakeManager", () => {
  describe("transformCapabilities()", () => {
    it("mirrors tools capability", () => {
      const result = HandshakeManager.transformCapabilities({ tools: { listChanged: true } });
      expect(result.tools).toEqual({ listChanged: true });
    });

    it("mirrors prompts capability", () => {
      const result = HandshakeManager.transformCapabilities({ prompts: { listChanged: true } });
      expect(result.prompts).toEqual({ listChanged: true });
    });

    it("mirrors resources with subscribe flag", () => {
      const result = HandshakeManager.transformCapabilities({
        resources: { subscribe: true, listChanged: true },
      });
      expect(result.resources).toEqual({ subscribe: true, listChanged: true });
    });

    it("adds logging capability", () => {
      const result = HandshakeManager.transformCapabilities({});
      expect(result.logging).toEqual({});
    });

    it("strips sampling capability", () => {
      const result = HandshakeManager.transformCapabilities({ sampling: {} });
      expect(result.sampling).toBeUndefined();
    });

    it("handles empty capabilities", () => {
      const result = HandshakeManager.transformCapabilities({});
      expect(result.tools).toBeUndefined();
      expect(result.prompts).toBeUndefined();
      expect(result.logging).toEqual({});
    });
  });
});

describe("NotificationRelay", () => {
  it("wires bidirectional logging handlers when capability exists", () => {
    const clientHandlers: Array<{ schema: unknown; handler: (n: unknown) => Promise<void> }> = [];
    const serverHandlers: Array<{ schema: unknown; handler: (n: unknown) => Promise<void> }> = [];

    const mockClient = {
      setNotificationHandler: (schema: unknown, handler: (n: unknown) => Promise<void>) => {
        clientHandlers.push({ schema, handler });
      },
      notification: async (_n: unknown) => {},
    };

    const mockServer = {
      setNotificationHandler: (schema: unknown, handler: (n: unknown) => Promise<void>) => {
        serverHandlers.push({ schema, handler });
      },
      notification: async (_n: unknown) => {},
    };

    NotificationRelay.wire(mockClient, mockServer, { logging: {} });

    expect(clientHandlers).toHaveLength(1);
    expect(serverHandlers).toHaveLength(1);
  });

  it("does not wire handlers when capability missing", () => {
    const clientHandlers: Array<unknown> = [];
    const mockClient = {
      setNotificationHandler: (_schema: unknown, _handler: unknown) => {
        clientHandlers.push(true);
      },
      notification: async () => {},
    };
    const mockServer = {
      setNotificationHandler: (_schema: unknown, _handler: unknown) => {},
      notification: async () => {},
    };

    NotificationRelay.wire(mockClient, mockServer, {});
    expect(clientHandlers).toHaveLength(0);
  });
});
