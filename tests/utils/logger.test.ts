import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Logger } from "../../src/utils/logger.js";

describe("Logger", () => {
  let tempDir: string;
  let logFile: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "warden-log-"));
    logFile = path.join(tempDir, "test.log");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes info messages to file", () => {
    const logger = new Logger({ file: logFile, console: false });
    logger.info("test message");
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("[INFO]");
    expect(content).toContain("test message");
  });

  it("writes with correct format", () => {
    const logger = new Logger({ file: logFile, console: false });
    logger.info("hello", { key: "value" });
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toMatch(/\[.*\] \[INFO\] hello/);
    expect(content).toContain('"key":"value"');
  });

  it("includes component in child logger", () => {
    const logger = new Logger({ file: logFile, console: false });
    const child = logger.child("proxy");
    child.info("child message");
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("[proxy]");
    expect(content).toContain("child message");
  });

  it("setLevel suppresses lower levels", () => {
    const logger = new Logger({ file: logFile, console: false, level: "warn" });
    logger.info("should not appear");
    logger.warn("should appear");
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).not.toContain("should not appear");
    expect(content).toContain("should appear");
  });

  it("silent level suppresses all output", () => {
    const logger = new Logger({ file: logFile, console: false, level: "silent" });
    logger.error("should not appear");
    expect(fs.existsSync(logFile)).toBe(false);
  });

  it("serializes error objects in error()", () => {
    const logger = new Logger({ file: logFile, console: false });
    const err = new Error("test error");
    logger.error("something failed", err);
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("test error");
    expect(content).toContain("Error");
  });

  it("rotates log file at maxSize", () => {
    const logger = new Logger({ file: logFile, console: false, maxSize: 100 });
    // Write enough to trigger rotation
    for (let i = 0; i < 20; i++) {
      logger.info("x".repeat(20));
    }
    expect(fs.existsSync(logFile + ".1")).toBe(true);
  });

  it("debug level includes all messages", () => {
    const logger = new Logger({ file: logFile, console: false, level: "debug" });
    logger.debug("debug msg");
    logger.info("info msg");
    logger.warn("warn msg");
    logger.error("error msg");
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("[DEBUG]");
    expect(content).toContain("[INFO]");
    expect(content).toContain("[WARN]");
    expect(content).toContain("[ERROR]");
  });

  it("child of child includes both components", () => {
    const logger = new Logger({ file: logFile, console: false });
    const child = logger.child("proxy");
    const grandchild = child.child("handler");
    grandchild.info("nested");
    const content = fs.readFileSync(logFile, "utf-8");
    expect(content).toContain("[proxy:handler]");
  });
});
