export type NotificationChannel = "os" | "webhook" | "log";

export interface NotificationEvent {
  type:
    | "new-tool"
    | "policy-block"
    | "rate-limit-warning"
    | "data-leak"
    | "injection"
    | "ssrf"
    | "generic";
  server: string;
  tool?: string;
  message: string;
  severity: "info" | "warning" | "critical";
  details?: Record<string, unknown>;
  timestamp: string;
}

export interface WebhookConfig {
  url: string;
  headers?: Record<string, string>;
  method?: "POST" | "PUT";
}

export interface NotifierConfig {
  channels: NotificationChannel[];
  webhook?: WebhookConfig;
  minSeverity: "info" | "warning" | "critical";
}

const SEVERITY_ORDER: Record<string, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export class Notifier {
  private config: NotifierConfig;
  private sentCount: number;

  constructor(config: NotifierConfig) {
    this.config = config;
    this.sentCount = 0;
  }

  notify(event: Omit<NotificationEvent, "timestamp">): Promise<void> {
    const fullEvent: NotificationEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    if (SEVERITY_ORDER[event.severity] < SEVERITY_ORDER[this.config.minSeverity]) {
      return Promise.resolve();
    }

    this.sentCount++;

    const dispatchers = this.config.channels.map((channel) => {
      switch (channel) {
        case "os":
          return this.sendOs(fullEvent);
        case "webhook":
          return this.sendWebhook(fullEvent);
        case "log":
          return this.sendLog(fullEvent);
      }
    });

    return Promise.allSettled(dispatchers).then(() => {
      // never rejects
    });
  }

  getSentCount(): number {
    return this.sentCount;
  }

  formatMessage(event: NotificationEvent): string {
    const toolPart = event.tool ? `/${event.tool}` : "";
    return `[WARDEN] [${event.severity}] ${event.type} on ${event.server}${toolPart}: ${event.message}`;
  }

  private async sendOs(event: NotificationEvent): Promise<void> {
    try {
      const notifier = await import("node-notifier");
      notifier.default?.({
        title: `[mcp-warden] ${event.severity} - ${event.type}`,
        message: this.formatMessage(event),
      });
    } catch {
      // node-notifier not installed — silently skip
    }
  }

  private async sendWebhook(event: NotificationEvent): Promise<void> {
    const webhook = this.config.webhook;
    if (!webhook) return;

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...webhook.headers,
      };

      const method = webhook.method ?? "POST";

      await fetch(webhook.url, {
        method,
        headers,
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(5000),
      });
    } catch (error) {
      process.stderr.write(`[WARDEN] webhook delivery failed: ${String(error)}\n`);
    }
  }

  private async sendLog(event: NotificationEvent): Promise<void> {
    const line = this.formatMessage(event) + "\n";
    process.stderr.write(line);
  }
}
