import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export interface HttpTransportConfig {
  url: URL;
  headers?: Record<string, string>;
  timeout?: number;
}

export class HttpTransport {
  static parseTarget(target: string): HttpTransportConfig | null {
    const trimmed = target.trim();

    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      try {
        const url = new URL(trimmed);
        return {
          url,
          timeout: 30000,
        };
      } catch {
        throw new Error(`Invalid HTTP URL: ${trimmed}`);
      }
    }

    return null;
  }

  static createTransport(config: HttpTransportConfig): StreamableHTTPClientTransport {
    return new StreamableHTTPClientTransport(config.url, {
      requestInit: {
        headers: config.headers ?? {},
        signal: AbortSignal.timeout(config.timeout ?? 30000),
      },
    });
  }

  static isHttpTarget(target: string): boolean {
    const trimmed = target.trim();
    return trimmed.startsWith("http://") || trimmed.startsWith("https://");
  }
}
