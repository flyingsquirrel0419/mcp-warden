import { z } from "zod";

export const RateLimitSchema = z.object({
  per_minute: z.number().positive().optional(),
  per_hour: z.number().positive().optional(),
  per_day: z.number().positive().optional(),
});

export const RuleMatchSchema = z.object({
  tool: z.string().optional(),
  input: z.record(z.object({ pattern: z.string() })).optional(),
});

export const RuleSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  match: RuleMatchSchema,
  action: z.enum(["block", "warn", "log"]),
  message: z.string().optional(),
});

export const ServerPolicySchema = z.object({
  mode: z.enum(["passthrough", "audit-only", "enforcing"]).optional(),
  allowed_tools: z.union([z.array(z.string()), z.literal("*")]).optional(),
  blocked_tools: z.array(z.string()).optional(),
  rate_limit: RateLimitSchema.optional(),
  rules: z.array(RuleSchema).optional(),
  alert_on_new_tool: z.boolean().optional(),
});

export const DefaultsSchema = z.object({
  mode: z.enum(["passthrough", "audit-only", "enforcing"]).default("audit-only"),
  alert_on_new_tool: z.boolean().default(true),
});

export const PolicyFileSchema = z.object({
  version: z.literal(1),
  defaults: DefaultsSchema.optional(),
  servers: z.record(z.string(), ServerPolicySchema).optional(),
});

// Inferred types
export type PolicyFile = z.infer<typeof PolicyFileSchema>;
export type ServerPolicy = z.infer<typeof ServerPolicySchema>;
export type PolicyRule = z.infer<typeof RuleSchema>;
export type RateLimit = z.infer<typeof RateLimitSchema>;
export type RuleMatch = z.infer<typeof RuleMatchSchema>;
export type Defaults = z.infer<typeof DefaultsSchema>;
