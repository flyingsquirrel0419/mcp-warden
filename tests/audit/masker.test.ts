import { describe, it, expect } from "vitest";
import { Masker } from "../../src/audit/Masker.js";

describe("Masker", () => {
  describe("mask()", () => {
    it("redacts api_key field", () => {
      const input = { api_key: "sk-ant-abc123", name: "test" };
      const result = Masker.mask(input);
      expect(result.api_key).toBe("***REDACTED***");
      expect(result.name).toBe("test");
    });

    it("redacts nested token field", () => {
      const input = { config: { token: "secret123", port: 3000 } };
      const result = Masker.mask(input);
      expect(result.config.token).toBe("***REDACTED***");
      expect(result.config.port).toBe(3000);
    });

    it("redacts values in arrays", () => {
      const input = [{ password: "x" }, { password: "y" }];
      const result = Masker.mask(input);
      expect(result[0].password).toBe("***REDACTED***");
      expect(result[1].password).toBe("***REDACTED***");
    });

    it("preserves non-sensitive fields", () => {
      const input = { server: "notion", tool: "search", count: 42 };
      const result = Masker.mask(input);
      expect(result).toEqual(input);
    });

    it("handles null and undefined", () => {
      expect(Masker.mask(null)).toBeNull();
      expect(Masker.mask(undefined)).toBeUndefined();
    });

    it("handles primitives", () => {
      expect(Masker.mask("hello")).toBe("hello");
      expect(Masker.mask(42)).toBe(42);
      expect(Masker.mask(true)).toBe(true);
    });

    it("does NOT mutate the original object", () => {
      const input = { api_key: "sk-test" };
      const result = Masker.mask(input);
      expect(result.api_key).toBe("***REDACTED***");
      expect(input.api_key).toBe("sk-test");
    });

    it("handles deep nesting (6+ levels)", () => {
      const input = { a: { b: { c: { d: { e: { f: { secret: "deep" } } } } } } };
      const result = Masker.mask(input);
      expect(result.a.b.c.d.e.f.secret).toBe("***REDACTED***");
    });

    it("respects maxDepth limit", () => {
      const input = { a: { b: { c: { secret: "deep" } } } };
      const result = Masker.mask(input, 2);
      // At depth 2, we stop recursing — the nested object is returned as-is
      expect(result).toEqual(input);
    });

    it("redacts multiple sensitive keys in same object", () => {
      const input = { api_key: "k1", token: "t1", password: "p1", name: "ok" };
      const result = Masker.mask(input);
      expect(result.api_key).toBe("***REDACTED***");
      expect(result.token).toBe("***REDACTED***");
      expect(result.password).toBe("***REDACTED***");
      expect(result.name).toBe("ok");
    });
  });

  describe("maskString()", () => {
    it("masks Anthropic key format with type label", () => {
      const result = Masker.maskString("sk-ant-api03-abcdef123456");
      expect(result).toBe("[anthropic-key]***REDACTED***");
    });

    it("masks OpenAI key format", () => {
      const result = Masker.maskString("sk-proj-abc123xyz");
      expect(result).toBe("[openai-key]***REDACTED***");
    });

    it("masks GitHub token format", () => {
      const result = Masker.maskString("ghp_ABCDEFGH123456");
      expect(result).toBe("[github-key]***REDACTED***");
    });

    it("masks AWS key format", () => {
      const result = Masker.maskString("AKIAIOSFODNN7EXAMPLE");
      expect(result).toBe("[aws-key]***REDACTED***");
    });

    it("does not expose raw secret characters", () => {
      const result = Masker.maskString("sk-ant-api03-supersecret");
      expect(result).not.toContain("sk-ant-a");
      expect(result).not.toContain("supersecret");
      expect(result).not.toContain("api03");
    });

    it("returns unchanged string for non-token values", () => {
      expect(Masker.maskString("hello world")).toBe("hello world");
    });
  });

  describe("isSensitiveKey()", () => {
    it("matches common sensitive keys", () => {
      expect(Masker.isSensitiveKey("api_key")).toBe(true);
      expect(Masker.isSensitiveKey("API_KEY")).toBe(true);
      expect(Masker.isSensitiveKey("x-api-key")).toBe(true);
      expect(Masker.isSensitiveKey("Authorization")).toBe(true);
      expect(Masker.isSensitiveKey("Set-Cookie")).toBe(true);
      expect(Masker.isSensitiveKey("token")).toBe(true);
      expect(Masker.isSensitiveKey("password")).toBe(true);
      expect(Masker.isSensitiveKey("secret")).toBe(true);
    });

    it("does not match non-sensitive keys", () => {
      expect(Masker.isSensitiveKey("name")).toBe(false);
      expect(Masker.isSensitiveKey("server")).toBe(false);
      expect(Masker.isSensitiveKey("tool")).toBe(false);
      expect(Masker.isSensitiveKey("port")).toBe(false);
    });
  });
});
