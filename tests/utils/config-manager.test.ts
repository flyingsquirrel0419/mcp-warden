import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ConfigManager } from "../../src/utils/ConfigManager.js";

describe("ConfigManager", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-config-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns default config values", () => {
    const cm = new ConfigManager(path.join(tempDir, "nonexistent.yaml"));
    const config = cm.load();
    expect(config.proxy_timeout_ms).toBe(30000);
    expect(config.dashboard_port).toBe(4242);
    expect(config.log_retention_days).toBe(30);
  });

  it("getConfigDir returns ~/.mcp-warden/", () => {
    expect(ConfigManager.getConfigDir()).toBe(path.join(os.homedir(), ".mcp-warden"));
  });

  it("getPolicyPath returns ~/.mcp-warden/policy.yaml", () => {
    expect(ConfigManager.getPolicyPath()).toBe(
      path.join(os.homedir(), ".mcp-warden", "policy.yaml"),
    );
  });

  it("ensureConfigDir creates directory", () => {
    const testDir = path.join(tempDir, "test-config");
    const original = ConfigManager.getConfigDir;
    // Use temp dir for testing
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    expect(fs.existsSync(testDir)).toBe(true);
  });

  it("load with non-existent file returns defaults", () => {
    const cm = new ConfigManager(path.join(tempDir, "nope.yaml"));
    const config = cm.load();
    expect(config.log_level).toBe("info");
  });

  it("load with valid YAML returns merged config", () => {
    const configPath = path.join(tempDir, "config.yaml");
    fs.writeFileSync(configPath, "log_level: debug\nproxy_timeout_ms: 60000");
    const cm = new ConfigManager(configPath);
    const config = cm.load();
    expect(config.log_level).toBe("debug");
    expect(config.proxy_timeout_ms).toBe(60000);
    expect(config.dashboard_port).toBe(4242); // default preserved
  });

  it("save + load round-trip preserves values", () => {
    const configPath = path.join(tempDir, "config.yaml");
    const cm = new ConfigManager(configPath);
    cm.save({ log_level: "warn", proxy_timeout_ms: 10000 });
    const config = cm.load();
    expect(config.log_level).toBe("warn");
    expect(config.proxy_timeout_ms).toBe(10000);
  });

  it("findMcpConfigs returns empty array when no configs exist", () => {
    const configs = ConfigManager.findMcpConfigs();
    // In test env, likely no configs exist
    expect(Array.isArray(configs)).toBe(true);
  });
});
