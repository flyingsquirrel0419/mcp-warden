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

  private static compileRules(rules: PolicyRule[]): CompiledRule[] {
    return rules.map((rule) => {
      const compiledPatterns = new Map<string, RegExp>();
      if (rule.match.input) {
        for (const [field, config] of Object.entries(rule.match.input)) {
          try {
            compiledPatterns.set(field, new RegExp(config.pattern, "i"));
          } catch (err) {
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
