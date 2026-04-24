import { describe, it, expect } from "vitest";
import { DataLeakDetector, type DataLeakConfig } from "../../src/security/DataLeakDetector.js";

describe("DataLeakDetector", () => {
  describe("clean responses", () => {
    it("does not flag small clean responses", () => {
      const detector = new DataLeakDetector();
      const result = detector.analyze("Hello, this is a normal response");
      expect(result.flagged).toBe(false);
      expect(result.reasons).toHaveLength(0);
      expect(result.severity).toBe("info");
    });

    it("does not flag empty string", () => {
      const detector = new DataLeakDetector();
      const result = detector.analyze("");
      expect(result.flagged).toBe(false);
      expect(result.reasons).toHaveLength(0);
    });
  });

  describe("size thresholds", () => {
    it("flags responses larger than warning threshold", () => {
      const detector = new DataLeakDetector({ warningThresholdBytes: 100 });
      const bigResponse = "a".repeat(101);
      const result = detector.analyze(bigResponse);
      expect(result.flagged).toBe(true);
      expect(result.severity).toBe("warning");
      expect(result.reasons.some((r) => r.type === "size")).toBe(true);
    });

    it("flags responses larger than block threshold with critical severity", () => {
      const detector = new DataLeakDetector({
        warningThresholdBytes: 100,
        blockThresholdBytes: 200,
      });
      const hugeResponse = "b".repeat(201);
      const result = detector.analyze(hugeResponse);
      expect(result.flagged).toBe(true);
      expect(result.severity).toBe("critical");
      const sizeReason = result.reasons.find((r) => r.type === "size");
      expect(sizeReason).toBeDefined();
      expect(sizeReason!.value).toBeGreaterThan(200);
    });

    it("does not flag content exactly at threshold boundary", () => {
      const detector = new DataLeakDetector({ warningThresholdBytes: 100 });
      const exactly100 = "x".repeat(100);
      const result = detector.analyze(exactly100);
      expect(result.flagged).toBe(false);
    });
  });

  describe("entropy detection", () => {
    it("detects high entropy base64-encoded content", () => {
      const detector = new DataLeakDetector();
      const randomBytes = Buffer.alloc(2000);
      for (let i = 0; i < 2000; i++) randomBytes[i] = Math.floor(Math.random() * 256);
      const base64Data = randomBytes.toString("base64");
      const result = detector.analyze(base64Data);
      expect(result.flagged).toBe(true);
      const entropyReason = result.reasons.find((r) => r.type === "entropy");
      expect(entropyReason).toBeDefined();
      expect(entropyReason!.value).toBeGreaterThan(4.5);
    });

    it("does not flag normal English text for entropy", () => {
      const detector = new DataLeakDetector();
      const englishText = "The quick brown fox jumps over the lazy dog. ".repeat(50);
      const result = detector.analyze(englishText);
      const entropyReason = result.reasons.find((r) => r.type === "entropy");
      expect(entropyReason).toBeUndefined();
    });

    it("skips entropy check for short content", () => {
      const detector = new DataLeakDetector();
      const shortHighEntropy = "a8f2c9e1b7d4";
      const result = detector.analyze(shortHighEntropy);
      const entropyReason = result.reasons.find((r) => r.type === "entropy");
      expect(entropyReason).toBeUndefined();
    });
  });

  describe("repetition detection", () => {
    it("detects repetitive content like database dumps", () => {
      const detector = new DataLeakDetector();
      const repeatedRow = '{"id":1,"name":"Alice","email":"a@b.com"},';
      const repetitiveContent = repeatedRow.repeat(2000);
      const result = detector.analyze(repetitiveContent);
      const repReason = result.reasons.find((r) => r.type === "repetition");
      expect(repReason).toBeDefined();
      expect(repReason!.value).toBeLessThan(0.4);
    });

    it("does not flag diverse non-repetitive content", () => {
      const detector = new DataLeakDetector();
      const lines: string[] = [];
      for (let i = 0; i < 500; i++) {
        lines.push(
          `Line ${i}: ${Math.random().toString(36).slice(2)} unique content here with number ${i * 7}`,
        );
      }
      const diverseContent = lines.join("\n");
      const result = detector.analyze(diverseContent);
      const repReason = result.reasons.find((r) => r.type === "repetition");
      expect(repReason).toBeUndefined();
    });
  });

  describe("PII concentration", () => {
    it("detects many email addresses and phone numbers", () => {
      const detector = new DataLeakDetector();
      const piiLines: string[] = [];
      for (let i = 0; i < 50; i++) {
        piiLines.push(
          `Contact: user${i}@example.com, phone: 555-01${String(i).padStart(2, "0")}-1234`,
        );
      }
      const piiContent = piiLines.join("\n");
      const result = detector.analyze(piiContent);
      expect(result.flagged).toBe(true);
      const piiReason = result.reasons.find((r) => r.type === "pii-concentration");
      expect(piiReason).toBeDefined();
      expect(piiReason!.value).toBeGreaterThan(0);
    });

    it("does not flag PII in very short content", () => {
      const detector = new DataLeakDetector();
      const result = detector.analyze("user@test.com 555-123-4567");
      const piiReason = result.reasons.find((r) => r.type === "pii-concentration");
      expect(piiReason).toBeUndefined();
    });
  });

  describe("input types", () => {
    it("handles object input by JSON stringifying", () => {
      const detector = new DataLeakDetector();
      const largeArray = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        data: "x".repeat(100),
      }));
      const result = detector.analyze({ items: largeArray });
      expect(result).toBeDefined();
      expect(typeof result.flagged).toBe("boolean");
    });

    it("handles Buffer input", () => {
      const detector = new DataLeakDetector();
      const buf = Buffer.from("Hello buffer world");
      const result = detector.analyze(buf);
      expect(result).toBeDefined();
      expect(result.flagged).toBe(false);
    });

    it("handles string input", () => {
      const detector = new DataLeakDetector();
      const result = detector.analyze("just a string");
      expect(result.flagged).toBe(false);
    });
  });

  describe("custom config", () => {
    it("respects custom warning threshold", () => {
      const detector = new DataLeakDetector({
        warningThresholdBytes: 100,
      });
      const result = detector.analyze("a".repeat(101));
      expect(result.flagged).toBe(true);
      expect(result.severity).toBe("warning");
    });

    it("respects custom block threshold", () => {
      const detector = new DataLeakDetector({
        blockThresholdBytes: 200,
        warningThresholdBytes: 100,
      });
      const result = detector.analyze("b".repeat(201));
      expect(result.flagged).toBe(true);
      expect(result.severity).toBe("critical");
    });

    it("respects custom entropy threshold", () => {
      const detector = new DataLeakDetector({ entropyThreshold: 7.0 });
      const base64Data = Buffer.from("x".repeat(2000)).toString("base64");
      const result = detector.analyze(base64Data);
      const entropyReason = result.reasons.find((r) => r.type === "entropy");
      expect(entropyReason).toBeUndefined();
    });
  });

  describe("static isLeak method", () => {
    it("returns true for leaky data", () => {
      const detector = new DataLeakDetector({ warningThresholdBytes: 100 });
      expect(detector.analyze("z".repeat(101)).flagged).toBe(true);
    });

    it("returns false for clean data", () => {
      expect(DataLeakDetector.isLeak("hello world")).toBe(false);
    });

    it("works with Buffer input", () => {
      expect(DataLeakDetector.isLeak(Buffer.from("short"))).toBe(false);
    });
  });

  describe("severity escalation", () => {
    it("escalates to critical when multiple flags combine", () => {
      const detector = new DataLeakDetector({
        warningThresholdBytes: 100,
        entropyThreshold: 3.0,
      });
      const largeRepetitive = "abcdefghij".repeat(2000);
      const result = detector.analyze(largeRepetitive);
      expect(result.flagged).toBe(true);
      expect(result.reasons.length).toBeGreaterThanOrEqual(2);
      expect(result.severity).toBe("critical");
    });
  });
});
