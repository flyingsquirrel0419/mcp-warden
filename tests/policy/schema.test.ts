import { describe, it, expect } from "vitest";
import {
  PolicyFileSchema,
  ServerPolicySchema,
  DefaultsSchema,
  RuleSchema,
  RateLimitSchema,
} from "../../src/policy/schema.js";

describe("PolicyFileSchema", () => {
  it("parses a valid full policy", () => {
    const policy = {
      version: 1,
      defaults: { mode: "audit-only" as const, alert_on_new_tool: true },
      servers: {
        notion: {
          mode: "enforcing",
          allowed_tools: ["search_pages", "get_page"],
          rate_limit: { per_minute: 20, per_day: 500 },
        },
        github: {
          mode: "enforcing",
          allowed_tools: "*",
          blocked_tools: ["delete_repository"],
          rate_limit: { per_minute: 30 },
        },
      },
    };
    const result = PolicyFileSchema.safeParse(policy);
    expect(result.success).toBe(true);
  });

  it("parses minimal policy (just version)", () => {
    const result = PolicyFileSchema.safeParse({ version: 1 });
    expect(result.success).toBe(true);
  });

  it("rejects missing version", () => {
    const result = PolicyFileSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects version 2", () => {
    const result = PolicyFileSchema.safeParse({ version: 2 });
    expect(result.success).toBe(false);
  });

  it("defaults mode to audit-only", () => {
    const result = DefaultsSchema.parse({});
    expect(result.mode).toBe("audit-only");
  });

  it("defaults alert_on_new_tool to true", () => {
    const result = DefaultsSchema.parse({});
    expect(result.alert_on_new_tool).toBe(true);
  });

  it("allows wildcard allowed_tools", () => {
    const result = ServerPolicySchema.safeParse({ allowed_tools: "*" });
    expect(result.success).toBe(true);
  });

  it("allows array allowed_tools", () => {
    const result = ServerPolicySchema.safeParse({ allowed_tools: ["tool1", "tool2"] });
    expect(result.success).toBe(true);
  });

  it("rejects invalid mode", () => {
    const result = ServerPolicySchema.safeParse({ mode: "strict" });
    expect(result.success).toBe(false);
  });

  it("validates rate limits", () => {
    const valid = RateLimitSchema.safeParse({ per_minute: 20 });
    expect(valid.success).toBe(true);

    const negative = RateLimitSchema.safeParse({ per_minute: -1 });
    expect(negative.success).toBe(false);
  });

  it("validates rules", () => {
    const rule = {
      name: "block-drop",
      match: { tool: "query", input: { sql: { pattern: "(?i)^\\s*(DROP|DELETE)" } } },
      action: "block" as const,
      message: "Not allowed",
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(true);
  });

  it("rejects invalid rule action", () => {
    const rule = {
      name: "test",
      match: {},
      action: "reject",
    };
    const result = RuleSchema.safeParse(rule);
    expect(result.success).toBe(false);
  });

  it("allows empty servers record", () => {
    const result = PolicyFileSchema.safeParse({ version: 1, servers: {} });
    expect(result.success).toBe(true);
  });
});
