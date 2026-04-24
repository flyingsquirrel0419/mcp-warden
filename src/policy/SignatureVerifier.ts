import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TrustedSigners } from "./TrustedSigners.js";

const execFileAsync = promisify(execFile);

export interface VerifyResult {
  verified: boolean;
  signer?: string;
  fingerprint?: string;
  reason?: string;
}

export class SignatureVerifier {
  constructor(private readonly repoPath: string) {}

  async verifyLatestCommit(): Promise<VerifyResult> {
    try {
      await this.requireGitVersion("2.34.0");
    } catch (err) {
      return {
        verified: false,
        reason: (err as Error).message,
      };
    }

    try {
      const { stdout: formatOut } = await execFileAsync("git", [
        "-C",
        this.repoPath,
        "log",
        "-1",
        "--format=%GS%n%GF",
        "HEAD",
      ]);

      const lines = formatOut.trim().split("\n");
      const signerInfo = lines[0] ?? "";
      const fingerprint = lines[1] ?? "";

      if (!signerInfo || signerInfo === "") {
        return {
          verified: false,
          reason: "Commit is not signed. SSH-signed commits are required for policy sync.",
        };
      }

      const signersPath = TrustedSigners.getSignersPath();

      try {
        const { stdout: verifyOut, stderr: verifyErr } = await execFileAsync(
          "git",
          ["-C", this.repoPath, "verify-commit", "HEAD"],
          {
            env: {
              ...process.env,
              GIT_CONFIG_COUNT: "1",
              GIT_CONFIG_KEY_0: "gpg.ssh.allowedSignersFile",
              GIT_CONFIG_VALUE_0: signersPath,
            },
          },
        );

        const output = verifyOut + verifyErr;
        if (output.includes("Good")) {
          const signer = this.parseSigner(output);
          return { verified: true, signer, fingerprint };
        }

        return {
          verified: false,
          reason: "Signature verification failed. Signer may not be in trusted list.",
        };
      } catch (err: unknown) {
        const stderr = (err as { stderr?: string })?.stderr ?? "";
        if (stderr.includes("Good")) {
          const signer = this.parseSigner(stderr);
          return { verified: true, signer, fingerprint };
        }
        return {
          verified: false,
          reason: `Signature invalid or signer not trusted: ${stderr.slice(0, 200)}`,
        };
      }
    } catch (err) {
      return {
        verified: false,
        reason: `Verification failed: ${(err as Error).message}`,
      };
    }
  }

  private parseSigner(output: string): string {
    const match = output.match(/for\s+(\S+@\S+)/);
    return match?.[1] ?? "unknown";
  }

  private async requireGitVersion(minVersion: string): Promise<void> {
    const { stdout } = await execFileAsync("git", ["--version"]);
    const match = stdout.match(/(\d+\.\d+\.\d+)/);
    if (!match) throw new Error("Cannot determine git version");

    const current = match[1].split(".").map(Number);
    const required = minVersion.split(".").map(Number);
    for (let i = 0; i < 3; i++) {
      if ((current[i] ?? 0) > (required[i] ?? 0)) return;
      if ((current[i] ?? 0) < (required[i] ?? 0))
        throw new Error(
          `git >= ${minVersion} required for SSH signature verification (have ${match[1]})`,
        );
    }
  }
}
