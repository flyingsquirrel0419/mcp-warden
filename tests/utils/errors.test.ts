import { describe, it, expect } from "vitest";
import {
  WardenError,
  PolicyBlockError,
  RateLimitError,
  ConfigError,
  DatabaseError,
  ProxyError,
} from "../../src/utils/errors.js";

describe("WardenError", () => {
  it("creates base error with code and message", () => {
    const err = new WardenError("test message", "TEST_CODE");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WardenError);
    expect(err.code).toBe("TEST_CODE");
    expect(err.message).toBe("test message");
    expect(err.name).toBe("WardenError");
  });

  it("preserves cause", () => {
    const cause = new Error("original");
    const err = new WardenError("wrapped", "CODE", cause);
    expect(err.cause).toBe(cause);
  });
});

describe("PolicyBlockError", () => {
  it("stores tool, reason, matchedRule", () => {
    const err = new PolicyBlockError("delete_page", "not in allowlist", "allow-only-reads");
    expect(err).toBeInstanceOf(WardenError);
    expect(err).toBeInstanceOf(PolicyBlockError);
    expect(err.code).toBe("POLICY_BLOCK");
    expect(err.tool).toBe("delete_page");
    expect(err.reason).toBe("not in allowlist");
    expect(err.matchedRule).toBe("allow-only-reads");
    expect(err.message).toContain("delete_page");
  });

  it("works without matchedRule", () => {
    const err = new PolicyBlockError("tool", "reason");
    expect(err.matchedRule).toBeUndefined();
  });
});

describe("RateLimitError", () => {
  it("stores server, limit, window", () => {
    const err = new RateLimitError("notion", 20, "minute");
    expect(err).toBeInstanceOf(WardenError);
    expect(err.code).toBe("RATE_LIMIT");
    expect(err.server).toBe("notion");
    expect(err.limit).toBe(20);
    expect(err.window).toBe("minute");
    expect(err.message).toContain("notion");
    expect(err.message).toContain("20");
  });
});

describe("ConfigError", () => {
  it("stores path", () => {
    const err = new ConfigError("file not found", "/path/to/policy.yaml");
    expect(err).toBeInstanceOf(WardenError);
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.path).toBe("/path/to/policy.yaml");
  });
});

describe("DatabaseError", () => {
  it("creates with message", () => {
    const err = new DatabaseError("connection failed");
    expect(err).toBeInstanceOf(WardenError);
    expect(err.code).toBe("DATABASE_ERROR");
  });
});

describe("ProxyError", () => {
  it("stores server name", () => {
    const err = new ProxyError("handshake failed", "github");
    expect(err).toBeInstanceOf(WardenError);
    expect(err.code).toBe("PROXY_ERROR");
    expect(err.server).toBe("github");
  });
});
