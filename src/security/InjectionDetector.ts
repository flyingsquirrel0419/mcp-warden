export interface InjectionResult {
  detected: boolean;
  severity: "low" | "medium" | "high";
  patterns: Array<{
    pattern: string;
    match: string;
    position: number;
  }>;
  confidence: number;
}

interface PatternEntry {
  regex: RegExp;
  severity: "low" | "medium" | "high";
  name: string;
}

const ZERO_WIDTH_RE = /[\u200B-\u200D\uFEFF\u2060\u180E\u202A-\u202E\u2066-\u2069]/g;

function buildDefaultPatterns(): PatternEntry[] {
  const directOverride: PatternEntry[] = [
    {
      regex: /ignore\s+(?:all\s+)?(?:previous|prior)\s+instructions/i,
      severity: "high",
      name: "ignore-previous-instructions",
    },
    {
      regex: /disregard\s+(?:your\s+)?(?:previous\s+|prior\s+)?(?:instructions|prompt)/i,
      severity: "high",
      name: "disregard-instructions",
    },
    {
      regex: /forget\s+(?:all\s+)?(?:prior\s+|previous\s+)?instructions/i,
      severity: "high",
      name: "forget-instructions",
    },
    { regex: /new\s+instructions?\s*:/i, severity: "high", name: "new-instructions" },
    {
      regex: /override\s+(?:your\s+)?(?:previous\s+|prior\s+)?instructions/i,
      severity: "high",
      name: "override-instructions",
    },
    {
      regex: /ignore\s+everything\s+(?:above|before)/i,
      severity: "high",
      name: "ignore-everything",
    },
    { regex: /disregard\s+(?:all\s+)?previous/i, severity: "high", name: "disregard-all-previous" },
    {
      regex: /system\s*:\s*(?:you|act|ignore|do|must|never|always|stop|start)/i,
      severity: "high",
      name: "system-directives",
    },
  ];

  const systemPromptManipulation: PatternEntry[] = [
    { regex: /#{1,3}\s*system\b/i, severity: "medium", name: "markdown-system" },
    { regex: /\[system\]/i, severity: "medium", name: "bracket-system" },
  ];

  const roleSwitching: PatternEntry[] = [
    {
      regex: /you\s+are\s+now\s+a\s+different/i,
      severity: "medium",
      name: "you-are-now-different",
    },
    { regex: /pretend\s+(?:that\s+)?you\s+are/i, severity: "medium", name: "pretend-you-are" },
    { regex: /act\s+as\s+if\s+you\s+are/i, severity: "medium", name: "act-as-if" },
    { regex: /roleplay\s+as/i, severity: "medium", name: "roleplay-as" },
  ];

  const outputManipulation: PatternEntry[] = [
    { regex: /output\s+(?:the\s+)?following/i, severity: "low", name: "output-following" },
    { regex: /repeat\s+after\s+me/i, severity: "low", name: "repeat-after-me" },
    { regex: /say\s+exactly/i, severity: "low", name: "say-exactly" },
  ];

  return [...directOverride, ...systemPromptManipulation, ...roleSwitching, ...outputManipulation];
}

export class InjectionDetector {
  private patterns: PatternEntry[];

  constructor(customPatterns?: string[]) {
    this.patterns = buildDefaultPatterns();

    if (customPatterns) {
      for (const raw of customPatterns) {
        this.patterns.push({
          regex: new RegExp(raw, "i"),
          severity: "medium",
          name: `custom:${raw}`,
        });
      }
    }
  }

  analyze(text: string): InjectionResult {
    const cleaned = text.replace(ZERO_WIDTH_RE, "");
    const hits: Array<{
      pattern: string;
      match: string;
      position: number;
      severity: "low" | "medium" | "high";
    }> = [];

    for (const entry of this.patterns) {
      const globalRe = new RegExp(entry.regex.source, entry.regex.flags + "g");
      let exec: RegExpExecArray | null;
      while ((exec = globalRe.exec(cleaned)) !== null) {
        hits.push({
          pattern: entry.name,
          match: exec[0],
          position: exec.index,
          severity: entry.severity,
        });
      }
    }

    if (hits.length === 0) {
      return { detected: false, severity: "low", patterns: [], confidence: 0 };
    }

    const hasHigh = hits.some((h) => h.severity === "high");
    const hasMedium = hits.some((h) => h.severity === "medium");
    const severity: InjectionResult["severity"] = hasHigh ? "high" : hasMedium ? "medium" : "low";

    let confidence: number;
    if (hits.length === 1) {
      confidence = cleaned.length < 50 ? 0.5 : 0.4;
    } else {
      confidence = Math.min(0.9, 0.7 + hits.length * 0.05);
    }

    if (hasHigh) {
      confidence = Math.min(1.0, confidence + 0.2);
    }

    return {
      detected: true,
      severity,
      patterns: hits.map(({ pattern, match, position }) => ({
        pattern,
        match,
        position,
      })),
      confidence: Math.round(confidence * 100) / 100,
    };
  }

  static isInjection(text: string): boolean {
    const detector = new InjectionDetector();
    return detector.analyze(text).detected;
  }
}
