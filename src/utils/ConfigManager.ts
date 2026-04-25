import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import YAML from "yaml";
import { ConfigError } from "./errors.js";

export interface WardenConfig {
  log_level: "debug" | "info" | "warn" | "error" | "silent";
  proxy_timeout_ms: number;
  dashboard_port: number;
  max_response_bytes: number;
  log_retention_days: number;
  db_max_size_mb: number;
  policy_path: string;
  db_path: string;
}

const DEFAULT_CONFIG: WardenConfig = {
  log_level: "info",
  proxy_timeout_ms: 30000,
  dashboard_port: 4242,
  max_response_bytes: 10485760,
  log_retention_days: 30,
  db_max_size_mb: 100,
  policy_path: "",
  db_path: "",
};

export class ConfigManager {
  private static readonly ALLOWED_KEYS: ReadonlySet<string> = new Set([
    "log_level",
    "proxy_timeout_ms",
    "dashboard_port",
    "max_response_bytes",
    "log_retention_days",
    "db_max_size_mb",
    "policy_path",
    "db_path",
    "policy_sync_url",
  ]);

  private config: WardenConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath ?? ConfigManager.getConfigFilePath();
    this.config = { ...DEFAULT_CONFIG };
    // Set default paths
    if (!this.config.policy_path) this.config.policy_path = ConfigManager.getPolicyPath();
    if (!this.config.db_path) this.config.db_path = ConfigManager.getDbPath();
  }

  static getConfigDir(): string {
    return path.join(os.homedir(), ".warden");
  }

  static getPolicyPath(): string {
    return path.join(ConfigManager.getConfigDir(), "policy.yaml");
  }

  static getDbPath(): string {
    return path.join(ConfigManager.getConfigDir(), "warden.db");
  }

  static getLogDir(): string {
    return path.join(ConfigManager.getConfigDir(), "logs");
  }

  static getConfigFilePath(): string {
    return path.join(ConfigManager.getConfigDir(), "config.yaml");
  }

  static isSafeConfigPath(filePath: string): boolean {
    const resolved = path.resolve(filePath);
    const configDir = path.resolve(ConfigManager.getConfigDir());
    return resolved.startsWith(configDir + path.sep) || resolved === configDir;
  }

  static ensureConfigDir(): void {
    const dir = ConfigManager.getConfigDir();
    fs.mkdirSync(dir, { recursive: true });
    const logDir = ConfigManager.getLogDir();
    fs.mkdirSync(logDir, { recursive: true });
  }

  load(): WardenConfig {
    try {
      if (!fs.existsSync(this.configPath)) {
        return { ...this.config };
      }
      const content = fs.readFileSync(this.configPath, "utf-8");
      const parsed = YAML.parse(content) as Partial<WardenConfig>;
      this.config = { ...DEFAULT_CONFIG, ...parsed };
      if (!this.config.policy_path) this.config.policy_path = ConfigManager.getPolicyPath();
      if (!this.config.db_path) this.config.db_path = ConfigManager.getDbPath();
      return { ...this.config };
    } catch (err) {
      throw new ConfigError(
        `Failed to load config: ${this.configPath}`,
        this.configPath,
        err instanceof Error ? err : undefined,
      );
    }
  }

  save(config: Partial<WardenConfig>): void {
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(config)) {
      if (ConfigManager.ALLOWED_KEYS.has(key)) {
        filtered[key] = value;
      }
    }
    if (
      typeof filtered.policy_path === "string" &&
      !ConfigManager.isSafeConfigPath(filtered.policy_path)
    ) {
      throw new ConfigError(
        "policy_path must be within ~/.warden/",
        filtered.policy_path as string,
      );
    }
    if (typeof filtered.db_path === "string" && !ConfigManager.isSafeConfigPath(filtered.db_path)) {
      throw new ConfigError("db_path must be within ~/.warden/", filtered.db_path as string);
    }
    ConfigManager.ensureConfigDir();
    this.config = { ...this.config, ...(filtered as Partial<WardenConfig>) };
    const content = YAML.stringify(this.config);
    fs.writeFileSync(this.configPath, content, "utf-8");
  }

  get<K extends keyof WardenConfig>(key: K): WardenConfig[K] {
    return this.config[key];
  }

  static findMcpConfigs(): Array<{ path: string; type: "claude-desktop" | "cursor" | "mcp-json" }> {
    const configs: Array<{ path: string; type: "claude-desktop" | "cursor" | "mcp-json" }> = [];

    // Claude Desktop
    const claudePaths = [
      path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json",
      ),
      path.join(os.homedir(), ".config", "Claude", "claude_desktop_config.json"),
    ];
    for (const p of claudePaths) {
      if (fs.existsSync(p)) configs.push({ path: p, type: "claude-desktop" });
    }

    // Cursor — walk up from cwd looking for .cursor/mcp.json
    let dir = process.cwd();
    for (let i = 0; i < 20; i++) {
      const cursorPath = path.join(dir, ".cursor", "mcp.json");
      if (fs.existsSync(cursorPath)) {
        configs.push({ path: cursorPath, type: "cursor" });
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    // .mcp.json — walk up from cwd
    dir = process.cwd();
    for (let i = 0; i < 20; i++) {
      const mcpPath = path.join(dir, ".mcp.json");
      if (fs.existsSync(mcpPath)) {
        configs.push({ path: mcpPath, type: "mcp-json" });
        break;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }

    return configs;
  }
}
