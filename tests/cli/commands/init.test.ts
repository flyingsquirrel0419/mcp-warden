import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Command } from "commander";
import { registerInitCommand } from "../../../src/cli/commands/init.js";
import { ConfigManager } from "../../../src/utils/ConfigManager.js";

describe("init command", () => {
  let tempDir: string;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-init-"));
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function makeProgram(): Command {
    const program = new Command();
    program.exitOverride();
    registerInitCommand(program);
    return program;
  }

  function cfgPath(name = "config.json"): string {
    return path.join(tempDir, name);
  }

  function writeCfg(name: string, data: object): void {
    fs.writeFileSync(cfgPath(name), JSON.stringify(data, null, 2), "utf-8");
  }

  function readCfg(name: string): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(cfgPath(name), "utf-8"));
  }

  function getOutput(): string {
    return (stdoutSpy.mock.calls as string[][]).map((c) => c[0]).join("");
  }

  it("wraps servers in a config file and creates backup", async () => {
    const original = {
      mcpServers: {
        notion: { command: "npx", args: ["-y", "@notion/server"] },
        github: { command: "npx", args: ["-y", "@github/server"] },
      },
    };
    writeCfg("config.json", original);

    vi.spyOn(ConfigManager, "findMcpConfigs").mockReturnValue([
      { path: cfgPath("config.json"), type: "claude-desktop" as const },
    ]);

    await makeProgram().parseAsync(["node", "mcp-warden", "init"]);

    const modified = readCfg("config.json");
    const servers = modified.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers.notion.command).toBe("mcp-warden");
    expect(servers.notion.args).toEqual([
      "proxy",
      "--target",
      "npx -y @notion/server",
      "--name",
      "notion",
    ]);
    expect(servers.github.command).toBe("mcp-warden");
    expect(servers.github.args).toEqual([
      "proxy",
      "--target",
      "npx -y @github/server",
      "--name",
      "github",
    ]);

    const backup = JSON.parse(fs.readFileSync(cfgPath("config.json") + ".backup", "utf-8"));
    expect(backup).toEqual(original);
    expect(getOutput()).toContain("Wrapped 2 servers");
  });

  it("quotes wrapped target args that contain spaces", async () => {
    writeCfg("config.json", {
      mcpServers: {
        local: { command: "node", args: ["my server.js", "--label", "hello world"] },
      },
    });

    vi.spyOn(ConfigManager, "findMcpConfigs").mockReturnValue([
      { path: cfgPath("config.json"), type: "claude-desktop" as const },
    ]);

    await makeProgram().parseAsync(["node", "mcp-warden", "init"]);

    const modified = readCfg("config.json");
    const servers = modified.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers.local.args).toEqual([
      "proxy",
      "--target",
      'node "my server.js" --label "hello world"',
      "--name",
      "local",
    ]);
  });

  it("skips already-wrapped servers", async () => {
    writeCfg("config.json", {
      mcpServers: {
        notion: { command: "npx", args: ["-y", "@notion/server"] },
        warden: {
          command: "mcp-warden",
          args: ["proxy", "--target", "foo", "--name", "warden"],
        },
      },
    });

    vi.spyOn(ConfigManager, "findMcpConfigs").mockReturnValue([
      { path: cfgPath("config.json"), type: "claude-desktop" as const },
    ]);

    await makeProgram().parseAsync(["node", "mcp-warden", "init"]);

    const modified = readCfg("config.json");
    const servers = modified.mcpServers as Record<string, { command: string; args: string[] }>;
    expect(servers.notion.command).toBe("mcp-warden");
    expect(servers.warden.command).toBe("mcp-warden");
    expect(servers.warden.args).toEqual(["proxy", "--target", "foo", "--name", "warden"]);
    expect(getOutput()).toContain("Wrapped 1 servers");
  });

  it("does not overwrite existing backup", async () => {
    writeCfg("config.json", {
      mcpServers: { test: { command: "node", args: ["server.js"] } },
    });

    const originalBackup = "ORIGINAL_BACKUP_CONTENT";
    fs.writeFileSync(cfgPath("config.json") + ".backup", originalBackup, "utf-8");

    vi.spyOn(ConfigManager, "findMcpConfigs").mockReturnValue([
      { path: cfgPath("config.json"), type: "claude-desktop" as const },
    ]);

    await makeProgram().parseAsync(["node", "mcp-warden", "init"]);

    const backup = fs.readFileSync(cfgPath("config.json") + ".backup", "utf-8");
    expect(backup).toBe(originalBackup);
  });

  it("handles config with no mcpServers gracefully", async () => {
    writeCfg("config.json", { someOtherKey: "value" });

    vi.spyOn(ConfigManager, "findMcpConfigs").mockReturnValue([
      { path: cfgPath("config.json"), type: "claude-desktop" as const },
    ]);

    await makeProgram().parseAsync(["node", "mcp-warden", "init"]);

    expect(fs.existsSync(cfgPath("config.json") + ".backup")).toBe(false);
    expect(getOutput()).not.toContain("Wrapped");
  });

  it("handles empty config directory (no configs found)", async () => {
    vi.spyOn(ConfigManager, "findMcpConfigs").mockReturnValue([]);

    await makeProgram().parseAsync(["node", "mcp-warden", "init"]);

    expect(getOutput()).toContain("No MCP client configurations found.");
    expect(getOutput()).toContain("Supported types: claude-desktop, cursor, mcp-json");
  });
});
