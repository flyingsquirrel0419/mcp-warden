import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Notifier } from "../../src/daemon/Notifier.js";
import type { NotifierConfig, NotificationEvent } from "../../src/daemon/Notifier.js";

describe("Notifier", () => {
  let notifier: Notifier;
  let config: NotifierConfig;
  let stderrOutput: string;
  let originalStderrWrite: typeof process.stderr.write;

  beforeEach(() => {
    originalStderrWrite = process.stderr.write;
    stderrOutput = "";
    process.stderr.write = vi.fn((chunk: string | Uint8Array) => {
      stderrOutput += chunk;
      return true;
    }) as unknown as typeof process.stderr.write;
  });

  afterEach(() => {
    process.stderr.write = originalStderrWrite;
  });

  function makeConfig(overrides: Partial<NotifierConfig> = {}): NotifierConfig {
    return {
      channels: ["log"],
      minSeverity: "info",
      ...overrides,
    };
  }

  function makeEvent(overrides: Partial<Omit<NotificationEvent, "timestamp">> = {}) {
    return {
      type: "generic" as const,
      server: "test-server",
      message: "something happened",
      severity: "info" as const,
      ...overrides,
    };
  }

  it("constructs with config", () => {
    config = makeConfig();
    notifier = new Notifier(config);
    expect(notifier).toBeInstanceOf(Notifier);
    expect(notifier.getSentCount()).toBe(0);
  });

  it("sends to log channel and writes to stderr", async () => {
    notifier = new Notifier(makeConfig());
    await notifier.notify(makeEvent({ server: "my-server", message: "test msg" }));
    expect(stderrOutput).toContain("[WARDEN] [info] generic on my-server: test msg");
    expect(stderrOutput).toContain("\n");
  });

  it("filters info events when minSeverity is warning", async () => {
    notifier = new Notifier(makeConfig({ minSeverity: "warning" }));
    await notifier.notify(makeEvent({ severity: "info" }));
    expect(stderrOutput).toBe("");
    expect(notifier.getSentCount()).toBe(0);
  });

  it("passes warning events when minSeverity is warning", async () => {
    notifier = new Notifier(makeConfig({ minSeverity: "warning" }));
    await notifier.notify(makeEvent({ severity: "warning" }));
    expect(stderrOutput).toContain("[WARDEN] [warning]");
    expect(notifier.getSentCount()).toBe(1);
  });

  it("always passes critical events", async () => {
    notifier = new Notifier(makeConfig({ minSeverity: "critical" }));
    await notifier.notify(makeEvent({ severity: "critical" }));
    expect(stderrOutput).toContain("[WARDEN] [critical]");
    expect(notifier.getSentCount()).toBe(1);
  });

  it("filters warning events when minSeverity is critical", async () => {
    notifier = new Notifier(makeConfig({ minSeverity: "critical" }));
    await notifier.notify(makeEvent({ severity: "warning" }));
    expect(stderrOutput).toBe("");
    expect(notifier.getSentCount()).toBe(0);
  });

  it("formatMessage includes server and tool", () => {
    notifier = new Notifier(makeConfig());
    const event: NotificationEvent = {
      type: "policy-block",
      server: "github",
      tool: "create_file",
      message: "blocked",
      severity: "warning",
      timestamp: new Date().toISOString(),
    };
    expect(notifier.formatMessage(event)).toBe(
      "[WARDEN] [warning] policy-block on github/create_file: blocked",
    );
  });

  it("formatMessage works without tool", () => {
    notifier = new Notifier(makeConfig());
    const event: NotificationEvent = {
      type: "rate-limit-warning",
      server: "slack",
      message: "80% reached",
      severity: "warning",
      timestamp: new Date().toISOString(),
    };
    expect(notifier.formatMessage(event)).toBe(
      "[WARDEN] [warning] rate-limit-warning on slack: 80% reached",
    );
  });

  it("getSentCount tracks correctly", async () => {
    notifier = new Notifier(makeConfig());
    expect(notifier.getSentCount()).toBe(0);
    await notifier.notify(makeEvent());
    expect(notifier.getSentCount()).toBe(1);
    await notifier.notify(makeEvent());
    expect(notifier.getSentCount()).toBe(2);
    await notifier.notify(makeEvent({ severity: "info" }));
    expect(notifier.getSentCount()).toBe(3);
  });

  describe("webhook channel", () => {
    let originalFetch: typeof globalThis.fetch;
    let fetchCalls: Array<{ url: string; opts: RequestInit }>;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      fetchCalls = [];
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    function mockFetch(status = 200): typeof globalThis.fetch {
      return (async (url: string | URL | Request, opts?: RequestInit) => {
        fetchCalls.push({ url: String(url), opts: opts ?? {} });
        return new Response(null, { status });
      }) as unknown as typeof globalThis.fetch;
    }

    it("sends webhook with correct JSON body", async () => {
      globalThis.fetch = mockFetch();
      notifier = new Notifier(
        makeConfig({
          channels: ["webhook"],
          webhook: { url: "https://hooks.example.com/notify" },
        }),
      );

      await notifier.notify(makeEvent({ server: "git", severity: "critical", message: "leak" }));

      expect(fetchCalls).toHaveLength(1);
      const call = fetchCalls[0];
      expect(call.url).toBe("https://hooks.example.com/notify");
      expect(call.opts.method).toBe("POST");

      const body = JSON.parse(call.opts.body as string) as NotificationEvent;
      expect(body.server).toBe("git");
      expect(body.severity).toBe("critical");
      expect(body.type).toBe("generic");
      expect(body.message).toBe("leak");
      expect(body.timestamp).toBeTruthy();
    });

    it("respects custom headers", async () => {
      globalThis.fetch = mockFetch();
      notifier = new Notifier(
        makeConfig({
          channels: ["webhook"],
          webhook: {
            url: "https://hooks.example.com/notify",
            headers: { Authorization: "Bearer tok123", "X-Custom": "yes" },
          },
        }),
      );

      await notifier.notify(makeEvent());

      const call = fetchCalls[0];
      const headers = call.opts.headers as Record<string, string>;
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Authorization"]).toBe("Bearer tok123");
      expect(headers["X-Custom"]).toBe("yes");
    });

    it("handles failure gracefully", async () => {
      globalThis.fetch = (async () => {
        throw new Error("network error");
      }) as unknown as typeof globalThis.fetch;

      notifier = new Notifier(
        makeConfig({
          channels: ["webhook", "log"],
          webhook: { url: "https://hooks.example.com/notify" },
        }),
      );

      await notifier.notify(makeEvent({ severity: "warning" }));

      expect(stderrOutput).toContain("webhook delivery failed");
      expect(notifier.getSentCount()).toBe(1);
    });
  });

  it("OS channel skips silently when node-notifier not available", async () => {
    notifier = new Notifier(makeConfig({ channels: ["os", "log"] }));
    await notifier.notify(makeEvent({ severity: "warning" }));

    expect(notifier.getSentCount()).toBe(1);
    expect(stderrOutput).toContain("[WARDEN]");
  });

  it("multiple channels all receive notification", async () => {
    const originalFetch = globalThis.fetch;
    let webhookCalled = false;
    globalThis.fetch = (async () => {
      webhookCalled = true;
      return new Response(null, { status: 200 });
    }) as unknown as typeof globalThis.fetch;

    try {
      notifier = new Notifier(
        makeConfig({
          channels: ["os", "webhook", "log"],
          webhook: { url: "https://hooks.example.com/notify" },
        }),
      );

      await notifier.notify(makeEvent({ severity: "critical" }));

      expect(webhookCalled).toBe(true);
      expect(stderrOutput).toContain("[WARDEN] [critical]");
      expect(notifier.getSentCount()).toBe(1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
