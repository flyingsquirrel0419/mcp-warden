import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => {
  const calls: Array<{ stdout?: string; stderr?: string; error?: Error & { stderr?: string } }> =
    [];
  const mockFn = (..._args: unknown[]) => {
    const cb = _args.find((a) => typeof a === "function") as
      | ((err: Error | null, stdout?: string, stderr?: string) => void)
      | undefined;
    if (!cb || calls.length === 0) return;
    const call = calls.shift()!;
    if (call.error) {
      cb(call.error, { stdout: call.stdout ?? "", stderr: call.stderr ?? "" });
    } else {
      cb(null, { stdout: call.stdout ?? "", stderr: call.stderr ?? "" });
    }
  };
  mockFn._queue = calls;
  return { execFile: mockFn };
});

vi.mock("../../src/policy/TrustedSigners.js", () => ({
  TrustedSigners: {
    getSignersPath: () => "/home/test/.mcp-warden/allowed_signers",
  },
}));

import { execFile } from "node:child_process";
import { SignatureVerifier } from "../../src/policy/SignatureVerifier.js";

type MockCall = { stdout?: string; stderr?: string; error?: Error & { stderr?: string } };
const queue = (execFile as unknown as { _queue: MockCall[] })._queue;

function enqueue(calls: MockCall[]) {
  queue.length = 0;
  queue.push(...calls);
}

describe("SignatureVerifier", () => {
  it("returns verified:true when git outputs Good signature", async () => {
    enqueue([
      { stdout: "git version 2.40.0\n" },
      { stdout: "alice@example.com\nSHA256:abc123\n" },
      { stdout: "", stderr: "Good git commit signature for alice@example.com\n" },
    ]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(true);
    expect(result.signer).toBe("alice@example.com");
    expect(result.fingerprint).toBe("SHA256:abc123");
  });

  it("returns verified:true when Good signature is in stderr of caught error", async () => {
    enqueue([
      { stdout: "git version 2.40.0\n" },
      { stdout: "bob@example.com\nSHA256:def456\n" },
      {
        error: Object.assign(new Error("exit code 1"), {
          stderr: "Good git commit signature for bob@example.com\n",
        }),
      },
    ]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(true);
    expect(result.signer).toBe("bob@example.com");
  });

  it("returns verified:false when commit is not signed", async () => {
    enqueue([{ stdout: "git version 2.40.0\n" }, { stdout: "\n\n" }]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("not signed");
  });

  it("returns verified:false when signer not in trusted list", async () => {
    enqueue([
      { stdout: "git version 2.40.0\n" },
      { stdout: "eve@evil.com\nSHA256:bad\n" },
      {
        error: Object.assign(new Error("exit code 1"), {
          stderr: "error: cannot verify signature\n",
        }),
      },
    ]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("not trusted");
  });

  it("returns verified:false when git version too old", async () => {
    enqueue([{ stdout: "git version 2.30.1\n" }]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("2.34.0");
  });

  it("returns verified:false when git version cannot be determined", async () => {
    enqueue([{ stdout: "git unknown\n" }]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("Cannot determine");
  });

  it("returns signer as unknown when email pattern not found in output", async () => {
    enqueue([
      { stdout: "git version 2.40.0\n" },
      { stdout: "someone\nSHA256:xyz\n" },
      { stdout: "", stderr: "Good git commit signature from key\n" },
    ]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(true);
    expect(result.signer).toBe("unknown");
  });

  it("returns verified:false when verify-commit output lacks Good", async () => {
    enqueue([
      { stdout: "git version 2.40.0\n" },
      { stdout: "user@example.com\nSHA256:aaa\n" },
      { stdout: "", stderr: "Signature made with unknown key\n" },
    ]);

    const verifier = new SignatureVerifier("/fake/repo");
    const result = await verifier.verifyLatestCommit();

    expect(result.verified).toBe(false);
    expect(result.reason).toContain("failed");
  });
});
