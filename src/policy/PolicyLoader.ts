import fs from "node:fs";
import YAML from "yaml";
import { PolicyFileSchema, type PolicyFile, type ServerPolicy, type PolicyRule } from "./schema.js";
import { ConfigError } from "../utils/errors.js";

export interface CompiledRule extends PolicyRule {
  compiledPatterns: Map<string, RegExp>;
}

export interface CompiledServerPolicy {
  serverName: string;
  mode: ServerPolicy["mode"];
  allowedTools: Set<string> | null; // null = wildcard "*"
  blockedTools: Set<string>;
  rules: CompiledRule[];
  rateLimit: ServerPolicy["rate_limit"];
  alertOnNewTool: boolean;
}

export interface CompiledPolicy {
  defaults: {
    mode: "passthrough" | "audit-only" | "enforcing";
    alertOnNewTool: boolean;
  };
  servers: Map<string, CompiledServerPolicy>;
}

export class PolicyLoader {
  static loadFromFile(filePath: string): CompiledPolicy {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.lstatSync(filePath);
        if (stat.isSymbolicLink()) {
          throw new Error(`Refusing to read symlink: ${filePath}`);
        }
      }
      const content = fs.readFileSync(filePath, "utf-8");
      return PolicyLoader.loadFromString(content);
    } catch (err) {
      if (err instanceof ConfigError) throw err;
      throw new ConfigError(
        `Failed to read policy file: ${filePath}`,
        filePath,
        err instanceof Error ? err : undefined,
      );
    }
  }

  static loadFromString(yamlContent: string): CompiledPolicy {
    const parsed = PolicyLoader.parseAndValidate(yamlContent);
    return PolicyLoader.compile(parsed);
  }

  static defaultPolicy(): CompiledPolicy {
    return {
      defaults: { mode: "audit-only", alertOnNewTool: true },
      servers: new Map(),
    };
  }

  private static parseAndValidate(content: string): PolicyFile {
    let parsed: unknown;
    try {
      parsed = YAML.parse(content);
    } catch (err) {
      throw new ConfigError(
        "Invalid YAML in policy file",
        "",
        err instanceof Error ? err : undefined,
      );
    }

    const result = PolicyFileSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      throw new ConfigError(`Policy validation failed: ${issues}`, "");
    }
    return result.data;
  }

  private static compile(parsed: PolicyFile): CompiledPolicy {
    const defaults = {
      mode: parsed.defaults?.mode ?? "audit-only",
      alertOnNewTool: parsed.defaults?.alert_on_new_tool ?? true,
    };

    const servers = new Map<string, CompiledServerPolicy>();
    if (parsed.servers) {
      for (const [name, policy] of Object.entries(parsed.servers)) {
        servers.set(name, {
          serverName: name,
          mode: policy.mode ?? defaults.mode,
          allowedTools: policy.allowed_tools === "*" ? null : new Set(policy.allowed_tools ?? []),
          blockedTools: new Set(policy.blocked_tools ?? []),
          rules: policy.rules ? PolicyLoader.compileRules(policy.rules) : [],
          rateLimit: policy.rate_limit,
          alertOnNewTool: policy.alert_on_new_tool ?? defaults.alertOnNewTool,
        });
      }
    }

    return { defaults, servers };
  }

  private static validateRegexSafety(pattern: string): void {
    // Max pattern length
    if (pattern.length > 200) {
      throw new ConfigError(
        `Regex pattern too long (${pattern.length} chars, max 200): ${pattern.slice(0, 50)}...`,
        "",
      );
    }

    // Max alternation depth: count '|' outside character classes
    let alternationCount = 0;
    let inCharClass = false;
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === "\\" && i + 1 < pattern.length) { i++; continue; }
      if (ch === "[") inCharClass = true;
      if (ch === "]") inCharClass = false;
      if (ch === "|" && !inCharClass) alternationCount++;
    }
    if (alternationCount > 20) {
      throw new ConfigError(
        `Regex pattern has too many alternations (${alternationCount}, max 20): ${pattern}`,
        "",
      );
    }

    // Check for deeply nested quantified groups: count depth of groups containing quantifiers
    let maxNesting = 0;
    let depth = 0;
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === "\\" && i + 1 < pattern.length) { i++; continue; }
      if (ch === "(") {
        depth++;
        // Peek ahead to see if this group contains a quantifier before closing
        let groupHasQuantifier = false;
        let groupDepth = 1;
        for (let j = i + 1; j < pattern.length && groupDepth > 0; j++) {
          const gc = pattern[j];
          if (gc === "\\" && j + 1 < pattern.length) { j++; continue; }
          if (gc === "(") groupDepth++;
          if (gc === ")") { groupDepth--; continue; }
          if ((gc === "+" || gc === "*" || gc === "{") && groupDepth === 1) {
            groupHasQuantifier = true;
          }
        }
        if (groupHasQuantifier && depth > maxNesting) maxNesting = depth;
      }
      if (ch === ")") depth--;
    }
    if (maxNesting > 3) {
      throw new ConfigError(
        `Regex pattern has deeply nested quantified groups (depth ${maxNesting}, max 3): ${pattern}`,
        "",
      );
    }

    // Check for ReDoS-vulnerable patterns:
    // - Nested quantifiers like (a+)+ or (a*)*
    // - Alternation with overlapping quantifiers like (a|a)+
    const dangerousPatterns = [
      /\([^)]*[+*{][^)]*\)[+*{]/,     // nested quantifiers: (a+)+
      /\([^)]*\|[^)]*\)[+*{]/,        // alternation with quantifier: (a|b)+
      /\(\?:[^)]*[+*{][^)]*\)[+*{]/,  // non-capturing nested: (?:a+)+
    ];

    for (const dangerous of dangerousPatterns) {
      if (dangerous.test(pattern)) {
        throw new ConfigError(
          `Regex pattern may cause catastrophic backtracking (ReDoS): ${pattern}`,
          "",
        );
      }
    }
  }

  private static compileRules(rules: PolicyRule[]): CompiledRule[] {
    return rules.map((rule) => {
      const compiledPatterns = new Map<string, RegExp>();
      if (rule.match.input) {
        for (const [field, config] of Object.entries(rule.match.input)) {
          try {
            PolicyLoader.validateRegexSafety(config.pattern);
            compiledPatterns.set(field, new RegExp(config.pattern, "i"));
          } catch (err) {
            if (err instanceof ConfigError) throw err;
            throw new ConfigError(
              `Invalid regex in rule "${rule.name}" for field "${field}": ${config.pattern}`,
              "",
              err instanceof Error ? err : undefined,
            );
          }
        }
      }
      return { ...rule, compiledPatterns };
    });
  }

  static resolveForServer(policy: CompiledPolicy, serverName: string): CompiledServerPolicy {
    const serverPolicy = policy.servers.get(serverName);
    if (serverPolicy) return serverPolicy;

    return {
      serverName,
      mode: policy.defaults.mode,
      allowedTools: null,
      blockedTools: new Set(),
      rules: [],
      rateLimit: undefined,
      alertOnNewTool: policy.defaults.alertOnNewTool,
    };
  }
}
