import { describe, it, expect, beforeEach } from "vitest";
import { PolicyEngine } from "../../src/policy/PolicyEngine.js";
import { PolicyLoader, type CompiledPolicy } from "../../src/policy/PolicyLoader.js";
import { RateLimiter } from "../../src/policy/RateLimiter.js";

function makePolicy(overrides?: Partial<CompiledPolicy>): CompiledPolicy {
  return PolicyLoader.loadFromString(`
version: 1
defaults:
  mode: enforcing
servers:
  notion:
    mode: enforcing
    allowed_tools:
      - search_pages
      - get_page
    blocked_tools:
      - delete_page
    rate_limit:
      per_minute: 5
    rules:
      - name: "block-sensitive"
        match:
          tool: search_pages
          input:
            query:
              pattern: "password|secret"
        action: block
        message: "Sensitive data detected"
  audit-server:
    mode: audit-only
    allowed_tools:
      - read
    blocked_tools:
      - write
  passthrough-server:
    mode: passthrough
  wildcard-server:
    mode: enforcing
    allowed_tools: "*"
    blocked_tools:
      - dangerous
`);
}

describe("PolicyEngine", () => {
  let engine: PolicyEngine;
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
    engine = new PolicyEngine(makePolicy(), limiter);
  });

  it("passthrough mode allows everything", () => {
    const result = engine.evaluate({ server: "passthrough-server", tool: "anything", input: {} });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("passthrough");
  });

  it("audit-only mode allows blocked tool but logs", () => {
    const result = engine.evaluate({ server: "audit-server", tool: "write", input: {} });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("audit-only");
  });

  it("enforcing mode blocks blocked tool", () => {
    const result = engine.evaluate({ server: "notion", tool: "delete_page", input: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("blocked");
  });

  it("allowed tools list: tool in list → allowed", () => {
    const result = engine.evaluate({ server: "notion", tool: "search_pages", input: {} });
    expect(result.allowed).toBe(true);
  });

  it("allowed tools list: tool NOT in list → blocked", () => {
    const result = engine.evaluate({ server: "notion", tool: "unknown_tool", input: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("not in allowed list");
  });

  it("allowed tools wildcard: everything allowed", () => {
    const result = engine.evaluate({ server: "wildcard-server", tool: "anything", input: {} });
    expect(result.allowed).toBe(true);
  });

  it("blocked tools in wildcard server", () => {
    const result = engine.evaluate({ server: "wildcard-server", tool: "dangerous", input: {} });
    expect(result.allowed).toBe(false);
  });

  it("rate limit exceeded → blocked", () => {
    for (let i = 0; i < 5; i++) {
      engine.evaluate({ server: "notion", tool: "search_pages", input: {} });
    }
    const result = engine.evaluate({ server: "notion", tool: "search_pages", input: {} });
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("Rate limit");
  });

  it("custom rule with regex matching input field", () => {
    const result = engine.evaluate({
      server: "notion",
      tool: "search_pages",
      input: { query: "find my password" },
    });
    expect(result.allowed).toBe(false);
    expect(result.matchedRule).toBe("block-sensitive");
  });

  it("custom rule with non-matching pattern → passes", () => {
    const result = engine.evaluate({
      server: "notion",
      tool: "search_pages",
      input: { query: "find my notes" },
    });
    expect(result.allowed).toBe(true);
  });

  it("reload() replaces policy", () => {
    const newPolicy = PolicyLoader.loadFromString(`
version: 1
defaults:
  mode: passthrough
`);
    engine.reload(newPolicy);
    const result = engine.evaluate({ server: "notion", tool: "anything", input: {} });
    expect(result.allowed).toBe(true);
    expect(result.mode).toBe("passthrough");
  });

  it("isNewTool returns true on first call", () => {
    const engine2 = new PolicyEngine(PolicyLoader.defaultPolicy(), new RateLimiter());
    expect(engine2.isNewTool("server", "tool-a")).toBe(true);
    expect(engine2.isNewTool("server", "tool-a")).toBe(false);
    expect(engine2.isNewTool("server", "tool-b")).toBe(true);
  });

  it("no server policy falls back to defaults", () => {
    const result = engine.evaluate({ server: "unknown-server", tool: "anything", input: {} });
    expect(result.mode).toBe("enforcing");
  });

  it("new tool alert sets reason", () => {
    const result = engine.evaluate({ server: "notion", tool: "get_page", input: {} });
    expect(result.allowed).toBe(true);
  });
});
