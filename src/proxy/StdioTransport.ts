export interface TransportConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
  timeout?: number;
}

export class StdioTransport {
  /**
   * Parse a target string like "npx @notionhq/notion-mcp-server" into a TransportConfig.
   * Handles: single command, command with args, quoted args.
   */
  static parseTarget(target: string): TransportConfig {
    const parts = target.match(/(?:[^\s"]+|"[^"]*")+/g) ?? [];
    const cleanParts = parts.map((p) => p.replace(/^"|"$/g, ""));

    if (cleanParts.length === 0) {
      throw new Error("Empty target command");
    }

    return {
      command: cleanParts[0],
      args: cleanParts.slice(1),
      timeout: 30000,
    };
  }
}
