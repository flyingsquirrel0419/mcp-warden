import { describe, it, expect } from "vitest";
import { SignatureVerifier } from "../../src/policy/SignatureVerifier.js";

describe("SignatureVerifier", () => {
  it("returns verified:false for non-git directory", async () => {
    const verifier = new SignatureVerifier("/tmp/nonexistent-dir-xyz");
    const result = await verifier.verifyLatestCommit();
    expect(result.verified).toBe(false);
    expect(result.reason).toBeDefined();
  });
});
