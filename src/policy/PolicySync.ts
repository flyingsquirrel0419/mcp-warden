import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";
import { ConfigManager } from "../utils/ConfigManager.js";
import { PolicyLoader } from "./PolicyLoader.js";

export interface RemotePolicy {
  name: string;
  description: string;
  filePath: string;
  sourceRepo: string;
}

export class PolicySync {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(os.homedir(), ".mcp-warden", "policy-cache");
  }

  syncRepo(repoUrl: string, branch?: string): string {
    const repoName = this.repoDirName(repoUrl);
    const localPath = path.join(this.cacheDir, repoName);

    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const branchArg = branch ? ` --branch ${branch}` : "";
      execSync(`git clone --depth 1${branchArg} ${repoUrl} ${localPath}`, {
        stdio: "pipe",
        timeout: 30000,
      });
    } else {
      try {
        execSync("git pull --ff-only", { cwd: localPath, stdio: "pipe", timeout: 15000 });
      } catch {
        // Pull failed — force fresh clone
        fs.rmSync(localPath, { recursive: true, force: true });
        const branchArg = branch ? ` --branch ${branch}` : "";
        execSync(`git clone --depth 1${branchArg} ${repoUrl} ${localPath}`, {
          stdio: "pipe",
          timeout: 30000,
        });
      }
    }

    return localPath;
  }

  listPolicies(repoUrl: string): RemotePolicy[] {
    const localPath = path.join(this.cacheDir, this.repoDirName(repoUrl));
    if (!fs.existsSync(localPath)) return [];

    const policies: RemotePolicy[] = [];

    const walkDir = (dir: string): void => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== ".git") walkDir(fullPath);
        } else if (entry.name.endsWith(".yaml") || entry.name.endsWith(".yml")) {
          policies.push(this.parsePolicyFile(fullPath, repoUrl));
        }
      }
    };

    walkDir(localPath);
    return policies;
  }

  applyPolicy(repoUrl: string, policyFileName: string): string {
    const localPath = path.join(this.cacheDir, this.repoDirName(repoUrl));
    const filePath = this.findPolicyFile(localPath, policyFileName);

    if (!filePath) {
      throw new Error(`Policy file not found: ${policyFileName}`);
    }

    const content = fs.readFileSync(filePath, "utf-8");

    // Validate before applying
    PolicyLoader.loadFromString(content);

    // Backup current policy
    const policyPath = ConfigManager.getPolicyPath();
    ConfigManager.ensureConfigDir();

    if (fs.existsSync(policyPath)) {
      const backupPath = policyPath + ".backup";
      fs.copyFileSync(policyPath, backupPath);
    }

    // Write new policy
    fs.writeFileSync(policyPath, content, "utf-8");
    return policyPath;
  }

  getSyncUrl(): string | null {
    const configPath = ConfigManager.getConfigFilePath();
    if (!fs.existsSync(configPath)) return null;

    const content = fs.readFileSync(configPath, "utf-8");
    const YAML = require("yaml");
    const config = YAML.parse(content) as Record<string, unknown>;
    return (config.policy_sync_url as string) ?? null;
  }

  setSyncUrl(url: string): void {
    const configManager = new ConfigManager();
    configManager.load();
    configManager.save({ policy_sync_url: url } as never);
  }

  private repoDirName(repoUrl: string): string {
    // Extract repo name from URL: git@github.com:org/repo.git → org_repo
    // or https://github.com/org/repo.git → org_repo
    const cleaned = repoUrl.replace(/\.git$/, "");
    const parts = cleaned.split(/[\/:]/);
    const lastTwo = parts.slice(-2);
    return lastTwo.join("_").replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  private parsePolicyFile(filePath: string, sourceRepo: string): RemotePolicy {
    const content = fs.readFileSync(filePath, "utf-8");
    let name = path.basename(filePath, path.extname(filePath));
    let description = "Community policy";

    try {
      const YAML = require("yaml");
      const parsed = YAML.parse(content) as Record<string, unknown>;
      if (parsed.name && typeof parsed.name === "string") name = parsed.name;
      if (parsed.description && typeof parsed.description === "string")
        description = parsed.description;
    } catch {
      // Use defaults
    }

    return {
      name,
      description,
      filePath: path.relative(this.cacheDir, filePath),
      sourceRepo,
    };
  }

  private findPolicyFile(repoDir: string, fileName: string): string | null {
    const walkDir = (dir: string): string | null => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name !== ".git") {
            const found = walkDir(fullPath);
            if (found) return found;
          }
        } else if (
          entry.name === fileName ||
          entry.name === fileName + ".yaml" ||
          entry.name === fileName + ".yml"
        ) {
          return fullPath;
        }
      }
      return null;
    };

    return walkDir(repoDir);
  }
}
