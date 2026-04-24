import {
  PolicyLoader,
  type CompiledPolicy,
  type CompiledServerPolicy,
  type CompiledRule,
} from "./PolicyLoader.js";
import { RateLimiter, type RateLimitResult } from "./RateLimiter.js";

export interface PolicyResult {
  allowed: boolean;
  reason?: string;
  matchedRule?: string;
  mode: "passthrough" | "audit-only" | "enforcing";
  rateLimitInfo?: { limit: number; remaining: number; resetAt: string };
}

export interface PolicyEvaluationRequest {
  server: string;
  tool: string;
  input: Record<string, unknown>;
}

export class PolicyEngine {
  private policy: CompiledPolicy;
  private rateLimiter: RateLimiter;
  private knownTools: Map<string, Set<string>> = new Map();

  constructor(policy: CompiledPolicy, rateLimiter: RateLimiter) {
    this.policy = policy;
    this.rateLimiter = rateLimiter;
  }

  evaluate(request: PolicyEvaluationRequest): PolicyResult {
    const serverPolicy = PolicyLoader.resolveForServer(this.policy, request.server);
    const mode: PolicyResult["mode"] = serverPolicy.mode ?? this.policy.defaults.mode;
    const isNew = this.isNewTool(request.server, request.tool);

    // 1. Passthrough mode: always allowed
    if (mode === "passthrough") {
      return { allowed: true, mode: "passthrough" };
    }

    // 2. Rate limits (enforced in ALL modes)
    const rateLimitResult = this.evaluateRateLimits(request.server, serverPolicy, mode);
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // 3. Blocked tools
    const blockedResult = this.evaluateBlockedTools(serverPolicy, request.tool);
    if (blockedResult && mode === "enforcing") {
      return { ...blockedResult, mode };
    }

    // 4. Allowed tools
    const allowedResult = this.evaluateAllowedTools(serverPolicy, request.tool);
    if (!allowedResult.allowed && mode === "enforcing") {
      return { ...allowedResult, mode };
    }

    // 5. Custom rules
    const ruleResult = this.evaluateRules(serverPolicy, request);
    if (ruleResult && ruleResult.action === "block" && mode === "enforcing") {
      return {
        allowed: false,
        reason: ruleResult.message ?? `Rule "${ruleResult.name}" triggered`,
        matchedRule: ruleResult.name,
        mode,
      };
    }

    // 6. New tool alert
    let reason: string | undefined;
    if (isNew && serverPolicy.alertOnNewTool) {
      reason = `New tool detected: ${request.tool}`;
    }

    // In audit-only mode, everything is allowed (except rate limits)
    return {
      allowed: true,
      reason,
      mode,
    };
  }

  reload(newPolicy: CompiledPolicy): void {
    this.policy = newPolicy;
  }

  isNewTool(server: string, tool: string): boolean {
    if (!this.knownTools.has(server)) {
      this.knownTools.set(server, new Set());
    }
    const tools = this.knownTools.get(server)!;
    if (tools.has(tool)) return false;
    tools.add(tool);
    return true;
  }

  private evaluateRateLimits(
    server: string,
    policy: CompiledServerPolicy,
    mode: PolicyResult["mode"],
  ): PolicyResult | null {
    if (!policy.rateLimit) return null;
    const results = this.rateLimiter.checkAndIncrement(server, policy.rateLimit);
    const exceeded = results.find((r) => !r.allowed);
    if (exceeded) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${exceeded.limit} calls per ${exceeded.windowType}`,
        mode,
        rateLimitInfo: {
          limit: exceeded.limit,
          remaining: exceeded.remaining,
          resetAt: exceeded.resetAt,
        },
      };
    }
    return null;
  }

  private evaluateBlockedTools(
    policy: CompiledServerPolicy,
    tool: string,
  ): Omit<PolicyResult, "mode"> | null {
    if (policy.blockedTools.has(tool)) {
      return { allowed: false, reason: `Tool "${tool}" is blocked` };
    }
    return null;
  }

  private evaluateAllowedTools(
    policy: CompiledServerPolicy,
    tool: string,
  ): Omit<PolicyResult, "mode"> {
    if (policy.allowedTools === null) return { allowed: true };
    if (!policy.allowedTools.has(tool)) {
      return { allowed: false, reason: `Tool "${tool}" not in allowed list` };
    }
    return { allowed: true };
  }

  private evaluateRules(
    policy: CompiledServerPolicy,
    request: PolicyEvaluationRequest,
  ): CompiledRule | null {
    for (const rule of policy.rules) {
      // Check tool name match
      if (rule.match.tool && rule.match.tool !== request.tool) continue;

      // Check input patterns
      if (rule.compiledPatterns.size > 0) {
        let allMatch = true;
        for (const [field, regex] of rule.compiledPatterns) {
          const value = String(request.input[field] ?? "");
          if (!PolicyEngine.safeRegexTest(regex, value)) {
            allMatch = false;
            break;
          }
        }
        if (allMatch) return rule;
      } else if (!rule.match.tool || rule.match.tool === request.tool) {
        // Rule with no input patterns and matching tool
        return rule;
      }
    }
    return null;
  }

  private static safeRegexTest(regex: RegExp, input: string, budgetMs: number = 50): boolean {
    const start = process.hrtime.bigint();
    const result = regex.test(input);
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    if (elapsed > budgetMs) {
      console.warn(
        `[PolicyEngine] Regex execution exceeded ${budgetMs}ms budget (${elapsed.toFixed(1)}ms) for pattern ${regex.source}, treating as no-match`,
      );
      return false;
    }
    return result;
  }
}
