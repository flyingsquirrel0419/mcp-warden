import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface LoggerConfig {
  level?: LogLevel;
  file?: string;
  maxSize?: number; // bytes, default 10MB
  console?: boolean; // default false (proxy mode — stdout reserved for MCP)
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

export class Logger {
  private level: LogLevel;
  private filePath: string;
  private maxSize: number;
  private consoleOutput: boolean;
  private component: string;

  constructor(config?: LoggerConfig) {
    this.level = config?.level ?? "info";
    this.filePath = config?.file ?? path.join(os.homedir(), ".mcp-warden", "logs", "warden.log");
    this.maxSize = config?.maxSize ?? 10 * 1024 * 1024; // 10MB
    this.consoleOutput = config?.console ?? false;
    this.component = "";
  }

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: string, message: string, meta?: Record<string, unknown>): string {
    const timestamp = new Date().toISOString();
    const prefix = this.component
      ? `[${timestamp}] [${level.toUpperCase()}] [${this.component}]`
      : `[${timestamp}] [${level.toUpperCase()}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
    return `${prefix} ${message}${metaStr}`;
  }

  private write(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (!this.shouldLog(level)) return;
    const formatted = this.formatMessage(level, message, meta);
    if (this.consoleOutput) {
      if (level === "error") {
        process.stderr.write(formatted + "\n");
      } else {
        process.stderr.write(formatted + "\n");
      }
    }
    this.writeToFile(formatted);
  }

  private writeToFile(line: string): void {
    try {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });
      this.rotateIfNeeded();
      fs.appendFileSync(this.filePath, line + "\n");
    } catch {
      // Silent fail — logging should never crash the proxy
    }
  }

  private rotateIfNeeded(): void {
    try {
      const stat = fs.statSync(this.filePath);
      if (stat.size >= this.maxSize) {
        const backup = this.filePath + ".1";
        if (fs.existsSync(backup)) fs.unlinkSync(backup);
        fs.renameSync(this.filePath, backup);
      }
    } catch {
      // File doesn't exist yet, no rotation needed
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.write("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>): void {
    this.write("info", message, meta);
  }
  warn(message: string, meta?: Record<string, unknown>): void {
    this.write("warn", message, meta);
  }

  error(message: string, error?: Error | unknown, meta?: Record<string, unknown>): void {
    const errorMeta =
      error instanceof Error
        ? { ...meta, errorName: error.name, errorMessage: error.message, stack: error.stack }
        : meta;
    this.write("error", message, errorMeta);
  }

  child(component: string): Logger {
    const childLogger = new Logger({
      level: this.level,
      file: this.filePath,
      maxSize: this.maxSize,
      console: this.consoleOutput,
    });
    childLogger.component = this.component ? `${this.component}:${component}` : component;
    return childLogger;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getFilePath(): string {
    return this.filePath;
  }
}
