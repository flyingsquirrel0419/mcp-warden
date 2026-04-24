import type { RateLimit } from "./schema.js";

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: string;
  windowType: "minute" | "hour" | "day";
}

export class RateLimiter {
  private counters: Map<string, number> = new Map();
  private db: {
    prepare: (sql: string) => {
      get: (...params: unknown[]) => unknown;
      all: (...params: unknown[]) => unknown[];
      run: (...params: unknown[]) => { changes: number };
    };
  } | null = null;

  constructor(db?: {
    prepare: (sql: string) => {
      get: (...params: unknown[]) => unknown;
      all: (...params: unknown[]) => unknown[];
      run: (...params: unknown[]) => { changes: number };
    };
  }) {
    this.db = db ?? null;
    this.load();
  }

  checkAndIncrement(server: string, limits: RateLimit): RateLimitResult[] {
    const results: RateLimitResult[] = [];

    const windows: Array<{ type: "minute" | "hour" | "day"; limit?: number }> = [
      { type: "minute", limit: limits.per_minute },
      { type: "hour", limit: limits.per_hour },
      { type: "day", limit: limits.per_day },
    ];

    for (const window of windows) {
      if (window.limit === undefined) continue;

      const key = this.getWindowKey(server, window.type);
      const current = this.counters.get(key) ?? 0;
      const allowed = current < window.limit;

      results.push({
        allowed,
        limit: window.limit,
        remaining: Math.max(0, window.limit - current - (allowed ? 1 : 0)),
        resetAt: this.getResetAt(window.type),
        windowType: window.type,
      });

      if (allowed) {
        this.counters.set(key, current + 1);
        this.persistKey(key, current + 1);
      }
    }

    // If ANY limit is exceeded, mark all as not allowed
    const anyBlocked = results.some((r) => !r.allowed);
    if (anyBlocked) {
      // Rollback increments for already-incremented windows
      for (let i = 0; i < results.length; i++) {
        if (!results[i].allowed) continue;
        // Decrement back since we're blocking overall
        const key = this.getWindowKey(server, results[i].windowType);
        const current = this.counters.get(key) ?? 1;
        const rolledBack = Math.max(0, current - 1);
        this.counters.set(key, rolledBack);
        this.persistKey(key, rolledBack);
        results[i].allowed = false;
        results[i].remaining = results[i].limit - (this.counters.get(key) ?? 0);
      }
    }

    return results;
  }

  reset(): void {
    this.counters.clear();
  }

  persist(): void {
    if (!this.db) return;
    for (const [key, count] of this.counters.entries()) {
      const [server, type, windowStart] = key.split("|");
      this.db
        .prepare(
          "INSERT OR REPLACE INTO rate_limits (server, window_start, window_type, call_count) VALUES (?, ?, ?, ?)",
        )
        .run(server, windowStart, type, count);
    }
  }

  load(): void {
    if (!this.db) return;
    const rows = this.db
      .prepare("SELECT server, window_start, window_type, call_count FROM rate_limits")
      .all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const server = String(row.server);
      const windowType = String(row.window_type);
      const windowStart = String(row.window_start);
      const count = Number(row.call_count);
      this.counters.set(`${server}|${windowType}|${windowStart}`, count);
    }
  }

  private persistKey(key: string, count: number): void {
    if (!this.db) return;
    const [server, type, windowStart] = key.split("|");
    this.db
      .prepare(
        "INSERT OR REPLACE INTO rate_limits (server, window_start, window_type, call_count) VALUES (?, ?, ?, ?)",
      )
      .run(server, windowStart, type, count);
  }

  private getWindowKey(server: string, type: "minute" | "hour" | "day"): string {
    const now = new Date();
    let windowStart: string;

    switch (type) {
      case "minute": {
        const d = new Date(now);
        d.setSeconds(0, 0);
        windowStart = d.toISOString();
        break;
      }
      case "hour": {
        const d = new Date(now);
        d.setMinutes(0, 0, 0);
        windowStart = d.toISOString();
        break;
      }
      case "day": {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        windowStart = d.toISOString();
        break;
      }
    }

    return `${server}|${type}|${windowStart}`;
  }

  private getResetAt(type: "minute" | "hour" | "day"): string {
    const now = new Date();
    switch (type) {
      case "minute": {
        const d = new Date(now);
        d.setMinutes(d.getMinutes() + 1, 0, 0);
        return d.toISOString();
      }
      case "hour": {
        const d = new Date(now);
        d.setHours(d.getHours() + 1, 0, 0, 0);
        return d.toISOString();
      }
      case "day": {
        const d = new Date(now);
        d.setDate(d.getDate() + 1);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      }
    }
  }
}
