import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import YAML from "yaml";
import { ConfigManager } from "../utils/ConfigManager.js";
import { PolicyLoader } from "./PolicyLoader.js";

export class PolicySignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PolicySignatureError";
  }
}

export interface RemotePolicy {
  name: string;
  description: string;
  filePath: string;
  sourceRepo: string;
}

export class PolicySync {
  private cacheDir: string;

  constructor(cacheDir?: string) {
    this.cacheDir = cacheDir ?? path.join(os.homedir(), ".warden", "policy-cache");
  }

  syncRepo(repoUrl: string, options?: { branch?: string; verifySignature?: boolean }): string {
    const branch = options?.branch;
    const verify = options?.verifySignature ?? true;
    const repoName = this.repoDirName(repoUrl);
    const localPath = path.join(this.cacheDir, repoName);

    if (!fs.existsSync(localPath)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const cloneArgs = ["clone", "--depth", "1"];
      if (branch) cloneArgs.push("--branch", branch);
      cloneArgs.push(repoUrl, localPath);
      execFileSync("git", cloneArgs, { stdio: "pipe", timeout: 30000 });
    } else {
      try {
        // Fast-forward only to prevent history rewrite attacks
        execFileSync("git", ["fetch", "origin"], { cwd: localPath, stdio: "pipe", timeout: 15000 });
        execFileSync("git", ["merge-base", "--is-ancestor", "HEAD", "FETCH_HEAD"], {
          cwd: localPath,
          stdio: "pipe",
        });
        execFileSync("git", ["merge", "--ff-only", "FETCH_HEAD"], {
          cwd: localPath,
          stdio: "pipe",
          timeout: 15000,
        });
      } catch {
        // Pull failed — force fresh clone
        fs.rmSync(localPath, { recursive: true, force: true });
        const retryArgs = ["clone", "--depth", "1"];
        if (branch) retryArgs.push("--branch", branch);
        retryArgs.push(repoUrl, localPath);
        execFileSync("git", retryArgs, {
          stdio: "pipe",
          timeout: 30000,
        });
      }
    }

    if (verify) {
      this.verifySync(localPath);
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

    if (fs.existsSync(filePath)) {
      const stat = fs.lstatSync(filePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to read symlink: ${filePath}`);
      }
    }
    const content = fs.readFileSync(filePath, "utf-8");

    // Validate before applying
    PolicyLoader.loadFromString(content);

    // Backup current policy
    const policyPath = ConfigManager.getPolicyPath();
    ConfigManager.ensureConfigDir();

    if (fs.existsSync(policyPath)) {
      const stat = fs.lstatSync(policyPath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Refusing to overwrite symlink: ${policyPath}`);
      }
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
    const config = YAML.parse(content) as Record<string, unknown>;
    return (config.policy_sync_url as string) ?? null;
  }

  setSyncUrl(url: string): void {
    const configManager = new ConfigManager();
    configManager.load();
    configManager.save({ policy_sync_url: url } as never);
  }

  private verifySync(repoPath: string): void {
    try {
      const signerInfo = execFileSync(
        "git",
        ["-C", repoPath, "log", "-1", "--format=%GS", "HEAD"],
        {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        },
      ).trim();

      if (!signerInfo) {
        throw new PolicySignatureError(
          `Refusing to apply unverified policy.\n` +
            `Reason: Commit is not signed. SSH-signed commits are required.\n\n` +
            `To trust a signer, run:\n` +
            `  warden policy trust-key --identity user@example.com --key "ssh-ed25519 AAAA..."\n` +
            `To skip verification, pass --no-verify.`,
        );
      }

      const signersPath = path.join(os.homedir(), ".warden", "allowed_signers");
      if (!fs.existsSync(signersPath)) {
        throw new PolicySignatureError(
          `No trusted signers configured.\n` +
            `Create ~/.warden/allowed_signers or run:\n` +
            `  warden policy trust-key --identity user@example.com --key "ssh-ed25519 AAAA..."`,
        );
      }

      try {
        execFileSync("git", ["-C", repoPath, "verify-commit", "HEAD"], {
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "gpg.ssh.allowedSignersFile",
            GIT_CONFIG_VALUE_0: signersPath,
          },
        });
      } catch (err: unknown) {
        const stderr =
          typeof (err as { stderr?: unknown }).stderr === "string"
            ? ((err as { stderr: string }).stderr as string)
            : ((err as { stderr?: Buffer })?.stderr?.toString() ?? "");
        if (!stderr.includes("Good")) {
          throw new PolicySignatureError(
            `Signature verification failed.\n` +
              `Reason: ${stderr.slice(0, 200) || "Signer not in trusted list"}\n\n` +
              `To trust a signer, run:\n` +
              `  warden policy trust-key --identity user@example.com --key "ssh-ed25519 AAAA..."`,
          );
        }
      }
    } catch (err) {
      if (err instanceof PolicySignatureError) throw err;
      throw new PolicySignatureError(`Signature verification error: ${(err as Error).message}`);
    }
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
