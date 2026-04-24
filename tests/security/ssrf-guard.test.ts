import { describe, it, expect, beforeEach } from "vitest";
import { SsrfGuard } from "../../src/security/SsrfGuard.js";

describe("SsrfGuard", () => {
  let guard: SsrfGuard;

  beforeEach(() => {
    guard = new SsrfGuard();
  });

  describe("checkUrl – loopback", () => {
    it("blocks http://127.0.0.1", () => {
      const r = guard.checkUrl("http://127.0.0.1");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("loopback");
    });

    it("blocks http://localhost", () => {
      const r = guard.checkUrl("http://localhost");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("loopback");
    });

    it("blocks http://localhost:8080", () => {
      const r = guard.checkUrl("http://localhost:8080");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("loopback");
    });

    it("blocks http://0.0.0.0", () => {
      const r = guard.checkUrl("http://0.0.0.0");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("loopback");
    });

    it("blocks http://[::1]", () => {
      const r = guard.checkUrl("http://[::1]");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("loopback");
    });

    it("blocks http://[::]", () => {
      const r = guard.checkUrl("http://[::]");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("loopback");
    });
  });

  describe("checkUrl – private IPv4 ranges", () => {
    it("blocks http://10.0.0.1 (class A)", () => {
      const r = guard.checkUrl("http://10.0.0.1");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("private-ipv4");
    });

    it("blocks http://192.168.1.1 (class C)", () => {
      const r = guard.checkUrl("http://192.168.1.1");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("private-ipv4");
    });

    it("blocks http://172.16.0.1 (class B start)", () => {
      const r = guard.checkUrl("http://172.16.0.1");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("private-ipv4");
    });

    it("blocks http://172.31.255.255 (class B end)", () => {
      const r = guard.checkUrl("http://172.31.255.255");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("private-ipv4");
    });

    it("allows http://172.32.0.1 (outside class B)", () => {
      const r = guard.checkUrl("http://172.32.0.1");
      expect(r.blocked).toBe(false);
    });
  });

  describe("checkUrl – link-local and metadata", () => {
    it("blocks http://169.254.169.254 (cloud metadata)", () => {
      const r = guard.checkUrl("http://169.254.169.254");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("metadata-endpoint");
    });

    it("blocks http://169.254.1.1 (link-local)", () => {
      const r = guard.checkUrl("http://169.254.1.1");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("link-local");
    });

    it("blocks http://metadata.google.internal", () => {
      const r = guard.checkUrl("http://metadata.google.internal");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("metadata-endpoint");
    });
  });

  describe("checkUrl – hostname-based", () => {
    it("blocks http://example.local", () => {
      const r = guard.checkUrl("http://example.local");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("hostname-private");
    });
  });

  describe("checkUrl – IPv6 ULA", () => {
    it("blocks fc00:: addresses", () => {
      const r = guard.checkUrl("http://[fc00::1]");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("ipv6-private");
    });

    it("blocks fd00:: addresses", () => {
      const r = guard.checkUrl("http://[fd00::1]");
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("ipv6-private");
    });
  });

  describe("checkUrl – allowed URLs", () => {
    it("allows http://example.com", () => {
      expect(guard.checkUrl("http://example.com").blocked).toBe(false);
    });

    it("allows http://google.com", () => {
      expect(guard.checkUrl("http://google.com").blocked).toBe(false);
    });

    it("allows https://api.github.com", () => {
      expect(guard.checkUrl("https://api.github.com").blocked).toBe(false);
    });
  });

  describe("checkUrl – edge cases", () => {
    it("handles invalid URLs gracefully (not blocked)", () => {
      const r = guard.checkUrl("not-a-valid-url");
      expect(r.blocked).toBe(false);
    });

    it("handles empty string gracefully", () => {
      const r = guard.checkUrl("");
      expect(r.blocked).toBe(false);
    });
  });

  describe("checkArguments", () => {
    it("finds blocked URL in nested object", () => {
      const args = {
        config: {
          endpoint: "http://169.254.169.254/latest/meta-data/",
        },
        name: "test",
      };
      const r = guard.checkArguments(args);
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("metadata-endpoint");
    });

    it("finds blocked URL in array values", () => {
      const args = {
        urls: ["http://example.com", "http://10.0.0.1/secret"],
      };
      const r = guard.checkArguments(args);
      expect(r.blocked).toBe(true);
      expect(r.category).toBe("private-ipv4");
    });

    it("returns clean for non-URL arguments", () => {
      const args = {
        name: "test-tool",
        count: 42,
        enabled: true,
        nested: { key: "value" },
      };
      expect(guard.checkArguments(args).blocked).toBe(false);
    });

    it("returns clean when all URLs are safe", () => {
      const args = {
        url: "https://api.github.com/repos/test",
      };
      expect(guard.checkArguments(args).blocked).toBe(false);
    });
  });

  describe("isInternal static", () => {
    it("returns true for internal addresses", () => {
      expect(SsrfGuard.isInternal("http://127.0.0.1")).toBe(true);
      expect(SsrfGuard.isInternal("http://10.0.0.1")).toBe(true);
      expect(SsrfGuard.isInternal("http://localhost")).toBe(true);
    });

    it("returns false for external addresses", () => {
      expect(SsrfGuard.isInternal("http://example.com")).toBe(false);
      expect(SsrfGuard.isInternal("https://google.com")).toBe(false);
    });

    it("returns false for invalid URLs", () => {
      expect(SsrfGuard.isInternal("not-a-url")).toBe(false);
    });
  });
});
