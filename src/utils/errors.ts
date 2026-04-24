export class WardenError extends Error {
  public readonly code: string;

  constructor(
    message: string,
    code: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = "WardenError";
    this.code = code;
  }
}

export class PolicyBlockError extends WardenError {
  public readonly tool: string;
  public readonly reason: string;
  public readonly matchedRule?: string;

  constructor(tool: string, reason: string, matchedRule?: string, cause?: Error) {
    super(`Tool "${tool}" blocked: ${reason}`, "POLICY_BLOCK", cause);
    this.name = "PolicyBlockError";
    this.tool = tool;
    this.reason = reason;
    this.matchedRule = matchedRule;
  }
}

export class RateLimitError extends WardenError {
  public readonly server: string;
  public readonly limit: number;
  public readonly window: string;

  constructor(server: string, limit: number, window: string, cause?: Error) {
    super(
      `Rate limit exceeded for server "${server}": ${limit} calls per ${window}`,
      "RATE_LIMIT",
      cause,
    );
    this.name = "RateLimitError";
    this.server = server;
    this.limit = limit;
    this.window = window;
  }
}

export class ConfigError extends WardenError {
  public readonly path: string;

  constructor(message: string, path: string, cause?: Error) {
    super(message, "CONFIG_ERROR", cause);
    this.name = "ConfigError";
    this.path = path;
  }
}

export class DatabaseError extends WardenError {
  constructor(message: string, cause?: Error) {
    super(message, "DATABASE_ERROR", cause);
    this.name = "DatabaseError";
  }
}

export class ProxyError extends WardenError {
  public readonly server: string;

  constructor(message: string, server: string, cause?: Error) {
    super(message, "PROXY_ERROR", cause);
    this.name = "ProxyError";
    this.server = server;
  }
}
