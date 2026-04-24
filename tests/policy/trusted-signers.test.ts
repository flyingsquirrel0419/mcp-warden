import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("TrustedSigners", () => {
  let tmpDir: string;
  let origHomedir: () => string;
  let TrustedSigners: typeof import("../../src/policy/TrustedSigners.js").TrustedSigners;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-signers-"));
    origHomedir = os.homedir;
    os.homedir = () => tmpDir;
    vi.resetModules();
    const mod = await import("../../src/policy/TrustedSigners.js");
    TrustedSigners = mod.TrustedSigners;
  });

  afterEach(() => {
    os.homedir = origHomedir;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty array when no signers file exists", () => {
    expect(TrustedSigners.load()).toEqual([]);
  });

  it("adds and loads a signer", () => {
    TrustedSigners.add("alice@example.com", "ssh-ed25519 AAAAB3NzaC1yc2EAAAA=");
    const signers = TrustedSigners.load();
    expect(signers).toHaveLength(1);
    expect(signers[0].identity).toBe("alice@example.com");
    expect(signers[0].publicKey).toContain("ssh-ed25519");
  });

  it("checks if a signer exists", () => {
    TrustedSigners.add("bob@example.com", "ssh-ed25519 BBBB");
    expect(TrustedSigners.has("bob@example.com")).toBe(true);
    expect(TrustedSigners.has("unknown@example.com")).toBe(false);
  });

  it("removes a signer", () => {
    TrustedSigners.add("charlie@example.com", "ssh-ed25519 CCCC");
    expect(TrustedSigners.remove("charlie@example.com")).toBe(true);
    expect(TrustedSigners.has("charlie@example.com")).toBe(false);
  });

  it("returns false when removing non-existent signer", () => {
    expect(TrustedSigners.remove("nobody@example.com")).toBe(false);
  });

  it("ignores comment lines", () => {
    const signersPath = TrustedSigners.getSignersPath();
    fs.mkdirSync(path.dirname(signersPath), { recursive: true });
    fs.writeFileSync(signersPath, "# comment\nalice@example.com ssh-ed25519 AAAA\n");
    const signers = TrustedSigners.load();
    expect(signers).toHaveLength(1);
    expect(signers[0].identity).toBe("alice@example.com");
  });
});
