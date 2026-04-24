import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { WardenDatabase } from "../../src/audit/db.js";
import { RateLimiter } from "../../src/policy/RateLimiter.js";

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("allows under limit", () => {
    const results = limiter.checkAndIncrement("notion", { per_minute: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].allowed).toBe(true);
    expect(results[0].remaining).toBe(4);
  });

  it("blocks at limit", () => {
    for (let i = 0; i < 5; i++) {
      limiter.checkAndIncrement("notion", { per_minute: 5 });
    }
    const results = limiter.checkAndIncrement("notion", { per_minute: 5 });
    expect(results[0].allowed).toBe(false);
    expect(results[0].remaining).toBe(0);
  });

  it("enforces multiple limit types", () => {
    const limits = { per_minute: 3, per_day: 10 };
    for (let i = 0; i < 3; i++) {
      limiter.checkAndIncrement("test", limits);
    }
    const results = limiter.checkAndIncrement("test", limits);
    expect(results).toHaveLength(2);
    expect(results.every((r) => !r.allowed)).toBe(true);
  });

  it("correct resetAt timestamps", () => {
    const results = limiter.checkAndIncrement("test", { per_minute: 5 });
    expect(results[0].resetAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(results[0].windowType).toBe("minute");
  });

  it("reset() clears all counters", () => {
    limiter.checkAndIncrement("test", { per_minute: 5 });
    limiter.reset();
    const results = limiter.checkAndIncrement("test", { per_minute: 5 });
    expect(results[0].allowed).toBe(true);
    expect(results[0].remaining).toBe(4);
  });

  it("different servers have independent counters", () => {
    for (let i = 0; i < 3; i++) {
      limiter.checkAndIncrement("server-a", { per_minute: 3 });
    }
    const resultsB = limiter.checkAndIncrement("server-b", { per_minute: 3 });
    expect(resultsB[0].allowed).toBe(true);

    const resultsA = limiter.checkAndIncrement("server-a", { per_minute: 3 });
    expect(resultsA[0].allowed).toBe(false);
  });

  it("50 allowed then 50 blocked at limit=50", () => {
    let allowed = 0;
    let blocked = 0;
    for (let i = 0; i < 100; i++) {
      const results = limiter.checkAndIncrement("test", { per_minute: 50 });
      if (results[0].allowed) allowed++;
      else blocked++;
    }
    expect(allowed).toBe(50);
    expect(blocked).toBe(50);
  });

  describe("database persistence", () => {
    let tempDir: string;
    let db: WardenDatabase;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-rate-limit-"));
      db = new WardenDatabase(path.join(tempDir, "test.db"));
      db.open();
    });

    afterEach(() => {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it("persists counters across RateLimiter instances", () => {
      const first = new RateLimiter(db);
      first.checkAndIncrement("notion", { per_minute: 1 });

      const second = new RateLimiter(db);
      const results = second.checkAndIncrement("notion", { per_minute: 1 });

      expect(results[0].allowed).toBe(false);
      expect(results[0].remaining).toBe(0);
    });
  });
});
