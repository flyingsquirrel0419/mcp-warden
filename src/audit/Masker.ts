export class Masker {
  private static readonly SENSITIVE_KEY_PATTERNS = [
    /api[_-]?key/i,
    /apikey/i,
    /token/i,
    /password/i,
    /passwd/i,
    /secret/i,
    /credential/i,
    /private[_-]?key/i,
    /auth/i,
    /authorization/i,
    /cookie/i,
    /session[_-]?id/i,
    /access[_-]?key/i,
  ];

  private static readonly TOKEN_VALUE_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
    { pattern: /^sk-ant-[a-zA-Z0-9]+/, name: "anthropic" },
    { pattern: /^sk-[a-zA-Z0-9]+/, name: "openai" },
    { pattern: /^ghp_[a-zA-Z0-9]+/, name: "github" },
    { pattern: /^AKIA[A-Z0-9]+/, name: "aws" },
    { pattern: /^xox[bpas]-[a-zA-Z0-9-]+/, name: "slack" },
    { pattern: /^eyJ[a-zA-Z0-9._-]+/, name: "jwt" },
  ];

  private static readonly REDACTED = "***REDACTED***";

  /**
   * Deep-clone and mask sensitive values in the input.
   * Original object is NOT mutated.
   */
  static mask<T>(data: T, maxDepth: number = 10): T {
    return Masker.maskValue(data, maxDepth, 0) as T;
  }

  /**
   * Mask known token formats in a string value.
   * Shows first 8 characters, then "***REDACTED***"
   */
  static maskString(value: string): string {
    for (const { pattern } of Masker.TOKEN_VALUE_PATTERNS) {
      if (pattern.test(value)) {
        const prefix = value.slice(0, 8);
        return `${prefix}...${Masker.REDACTED}`;
      }
    }
    return value;
  }

  /**
   * Check if a key name looks sensitive
   */
  static isSensitiveKey(key: string): boolean {
    return Masker.SENSITIVE_KEY_PATTERNS.some((p) => p.test(key));
  }

  private static maskValue(value: unknown, maxDepth: number, currentDepth: number): unknown {
    if (currentDepth >= maxDepth) return value;
    if (value === null || value === undefined) return value;
    if (typeof value === "boolean" || typeof value === "number") return value;
    if (typeof value === "string") return value; // strings are only masked when key is sensitive
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) {
      return value.map((item) => Masker.maskValue(item, maxDepth, currentDepth + 1));
    }
    if (typeof value === "object") {
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (Masker.isSensitiveKey(key)) {
          result[key] = Masker.REDACTED;
        } else {
          result[key] = Masker.maskValue(val, maxDepth, currentDepth + 1);
        }
      }
      return result;
    }
    return value;
  }
}
