import { describe, it, expect } from "vitest";
import { HttpTransport } from "../../src/proxy/HttpTransport.js";

describe("HttpTransport", () => {
  describe("parseTarget()", () => {
    it("parses http:// URL", () => {
      const result = HttpTransport.parseTarget("http://localhost:3000/mcp");
      expect(result).not.toBeNull();
      expect(result!.url.href).toBe("http://localhost:3000/mcp");
    });

    it("parses https:// URL", () => {
      const result = HttpTransport.parseTarget("https://mcp.example.com/sse");
      expect(result).not.toBeNull();
      expect(result!.url.protocol).toBe("https:");
    });

    it("returns null for command targets", () => {
      expect(HttpTransport.parseTarget("npx @notionhq/server")).toBeNull();
      expect(HttpTransport.parseTarget("node server.js")).toBeNull();
    });

    it("throws on invalid URL", () => {
      expect(() => HttpTransport.parseTarget("http://")).toThrow();
    });

    it("trims whitespace before parsing", () => {
      const result = HttpTransport.parseTarget("  https://example.com/mcp  ");
      expect(result).not.toBeNull();
      expect(result!.url.hostname).toBe("example.com");
    });

    it("sets default timeout", () => {
      const result = HttpTransport.parseTarget("http://localhost:8080");
      expect(result!.timeout).toBe(30000);
    });

    it("preserves query parameters", () => {
      const result = HttpTransport.parseTarget("http://localhost:3000/mcp?token=abc");
      expect(result!.url.search).toBe("?token=abc");
    });

    it("preserves port number", () => {
      const result = HttpTransport.parseTarget("http://localhost:4242/mcp");
      expect(result!.url.port).toBe("4242");
    });
  });

  describe("isHttpTarget()", () => {
    it("returns true for http://", () => {
      expect(HttpTransport.isHttpTarget("http://localhost:3000")).toBe(true);
    });

    it("returns true for https://", () => {
      expect(HttpTransport.isHttpTarget("https://example.com")).toBe(true);
    });

    it("returns false for commands", () => {
      expect(HttpTransport.isHttpTarget("npx @some/server")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(HttpTransport.isHttpTarget("")).toBe(false);
    });

    it("handles leading whitespace", () => {
      expect(HttpTransport.isHttpTarget("  http://localhost")).toBe(true);
    });
  });

  describe("createTransport()", () => {
    it("creates a transport from config", () => {
      const config = {
        url: new URL("http://localhost:3000/mcp"),
        timeout: 5000,
      };
      const transport = HttpTransport.createTransport(config);
      expect(transport).toBeDefined();
    });

    it("uses default timeout when not specified", () => {
      const config = {
        url: new URL("http://localhost:3000/mcp"),
      };
      const transport = HttpTransport.createTransport(config);
      expect(transport).toBeDefined();
    });
  });
});
