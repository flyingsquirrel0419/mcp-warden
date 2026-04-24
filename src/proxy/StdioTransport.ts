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
    const cleanParts = StdioTransport.splitCommand(target);

    if (cleanParts.length === 0) {
      throw new Error("Empty target command");
    }

    return {
      command: cleanParts[0],
      args: cleanParts.slice(1),
      timeout: 30000,
    };
  }

  static stringifyTarget(command: string, args: string[] = []): string {
    return [command, ...args].map((part) => StdioTransport.quoteArg(part)).join(" ");
  }

  private static quoteArg(value: string): string {
    if (value.length === 0) return '""';
    if (!/[\s"'\\]/.test(value)) return value;
    return `"${value.replace(/(["\\])/g, "\\$1")}"`;
  }

  private static splitCommand(target: string): string[] {
    const parts: string[] = [];
    let current = "";
    let quote: "'" | '"' | null = null;
    let escaping = false;

    for (const char of target.trim()) {
      if (escaping) {
        current += char;
        escaping = false;
        continue;
      }

      if (char === "\\") {
        escaping = true;
        continue;
      }

      if ((char === '"' || char === "'") && quote === null) {
        quote = char;
        continue;
      }

      if (char === quote) {
        quote = null;
        continue;
      }

      if (/\s/.test(char) && quote === null) {
        if (current.length > 0) {
          parts.push(current);
          current = "";
        }
        continue;
      }

      current += char;
    }

    if (escaping) current += "\\";
    if (current.length > 0) parts.push(current);
    return parts;
  }
}
