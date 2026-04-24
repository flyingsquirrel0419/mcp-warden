export interface DataLeakResult {
  flagged: boolean;
  severity: "info" | "warning" | "critical";
  reasons: Array<{
    type: "size" | "entropy" | "repetition" | "pii-concentration";
    detail: string;
    value: number;
  }>;
}

export interface DataLeakConfig {
  warningThresholdBytes: number;
  blockThresholdBytes: number;
  entropyThreshold: number;
  repetitionThreshold: number;
}

const DEFAULT_CONFIG: DataLeakConfig = {
  warningThresholdBytes: 1_048_576,
  blockThresholdBytes: 10_485_760,
  entropyThreshold: 4.5,
  repetitionThreshold: 0.6,
};

const PII_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
  /\b\d{3}-\d{2}-\d{4}\b/g,
  /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
];

export class DataLeakDetector {
  private config: DataLeakConfig;

  constructor(config?: Partial<DataLeakConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  analyze(data: string | Buffer | Record<string, unknown>): DataLeakResult {
    const str = this.toString(data);
    const byteLength = Buffer.byteLength(str, "utf-8");
    const reasons: DataLeakResult["reasons"] = [];

    if (byteLength > this.config.blockThresholdBytes) {
      reasons.push({
        type: "size",
        detail: `Response size ${byteLength} bytes exceeds block threshold ${this.config.blockThresholdBytes}`,
        value: byteLength,
      });
    } else if (byteLength > this.config.warningThresholdBytes) {
      reasons.push({
        type: "size",
        detail: `Response size ${byteLength} bytes exceeds warning threshold ${this.config.warningThresholdBytes}`,
        value: byteLength,
      });
    }

    if (str.length > 1024) {
      const entropy = this.shannonEntropy(str);
      if (entropy > this.config.entropyThreshold) {
        reasons.push({
          type: "entropy",
          detail: `High entropy content (${entropy.toFixed(2)} bits/char)`,
          value: entropy,
        });
      }
    }

    if (str.length > 10_240) {
      const uniqueRatio = this.uniqueChunkRatio(str);
      if (uniqueRatio < 1 - this.config.repetitionThreshold) {
        reasons.push({
          type: "repetition",
          detail: `Repetitive content (unique ratio ${uniqueRatio.toFixed(2)})`,
          value: uniqueRatio,
        });
      }
    }

    if (byteLength > 500) {
      const piiCount = this.countPII(str);
      if (piiCount > 0) {
        const density = piiCount / (byteLength / 1024);
        reasons.push({
          type: "pii-concentration",
          detail: `${piiCount} PII patterns detected (${density.toFixed(1)}/KB)`,
          value: density,
        });
      }
    }

    if (reasons.length === 0) {
      return { flagged: false, severity: "info", reasons: [] };
    }

    const severity = this.determineSeverity(reasons);
    return { flagged: true, severity, reasons };
  }

  static isLeak(data: string | Buffer | Record<string, unknown>): boolean {
    return new DataLeakDetector().analyze(data).flagged;
  }

  private determineSeverity(reasons: DataLeakResult["reasons"]): "info" | "warning" | "critical" {
    const hasBlockSize = reasons.some(
      (r) => r.type === "size" && r.value > this.config.blockThresholdBytes,
    );

    if (hasBlockSize || reasons.length >= 2) {
      return "critical";
    }

    const hasWarningSize = reasons.some(
      (r) => r.type === "size" && r.value > this.config.warningThresholdBytes,
    );

    if (hasWarningSize) {
      return "warning";
    }

    const reason = reasons[0];
    if (reason.type === "pii-concentration" && reason.value < 10) {
      return "info";
    }

    return "warning";
  }

  private toString(data: string | Buffer | Record<string, unknown>): string {
    if (Buffer.isBuffer(data)) {
      return data.toString("utf-8");
    }
    if (typeof data === "string") {
      return data;
    }
    return JSON.stringify(data);
  }

  private shannonEntropy(str: string): number {
    const freq = new Map<string, number>();
    for (const char of str) {
      freq.set(char, (freq.get(char) ?? 0) + 1);
    }

    let entropy = 0;
    const len = str.length;
    for (const count of freq.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }
    return entropy;
  }

  private uniqueChunkRatio(str: string): number {
    const chunkSize = 100;
    const chunks: string[] = [];
    for (let i = 0; i + chunkSize <= str.length; i += chunkSize) {
      chunks.push(str.slice(i, i + chunkSize));
    }
    if (chunks.length === 0) return 1;
    const uniqueChunks = new Set(chunks);
    return uniqueChunks.size / chunks.length;
  }

  private countPII(str: string): number {
    let count = 0;
    for (const pattern of PII_PATTERNS) {
      const matches = str.match(pattern);
      if (matches) count += matches.length;
    }
    return count;
  }
}
