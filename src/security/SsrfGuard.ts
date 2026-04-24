export interface SsrfResult {
  blocked: boolean;
  reason?: string;
  url?: string;
  category?:
    | "loopback"
    | "private-ipv4"
    | "link-local"
    | "ipv6-private"
    | "hostname-private"
    | "metadata-endpoint";
}

const URL_PREFIX_RE = /^https?:\/\//i;

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.azure.com"]);

/** CIDR match for dotted-decimal IPv4 addresses. */
function ipv4InCidr(ip: string, base: string, prefixBits: number): boolean {
  const toNum = (s: string) => {
    const p = s.split(".");
    return (
      ((parseInt(p[0], 10) << 24) |
        (parseInt(p[1], 10) << 16) |
        (parseInt(p[2], 10) << 8) |
        parseInt(p[3], 10)) >>>
      0
    );
  };
  const ipNum = toNum(ip);
  const baseNum = toNum(base);
  const mask = prefixBits === 0 ? 0 : (~0 << (32 - prefixBits)) >>> 0;
  return (ipNum & mask) === (baseNum & mask);
}

function isIPv4(s: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(s);
}

function isIPv6(s: string): boolean {
  const bare = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
  return /^[0-9a-fA-F:]+$/.test(bare) && bare.includes(":");
}

function classifyIPv4(ip: string): SsrfResult["category"] | null {
  if (ip === "127.0.0.1" || ip === "0.0.0.0") return "loopback";
  if (ipv4InCidr(ip, "169.254.0.0", 16)) return "link-local";
  if (ipv4InCidr(ip, "10.0.0.0", 8)) return "private-ipv4";
  if (ipv4InCidr(ip, "192.168.0.0", 16)) return "private-ipv4";
  if (ipv4InCidr(ip, "172.16.0.0", 12)) return "private-ipv4";
  return null;
}

function classifyIPv6(raw: string): SsrfResult["category"] | null {
  const bare = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
  const norm = bare.toLowerCase();

  if (norm === "::1" || norm === "0000:0000:0000:0000:0000:0000:0000:0001") return "loopback";
  if (norm === "::" || norm === "0000:0000:0000:0000:0000:0000:0000:0000") return "loopback";
  if (norm.startsWith("fc") || norm.startsWith("fd")) return "ipv6-private";

  return null;
}

export class SsrfGuard {
  checkUrl(url: string): SsrfResult {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { blocked: false };
    }

    const hostname = parsed.hostname;

    if (BLOCKED_HOSTNAMES.has(hostname.toLowerCase())) {
      const category: SsrfResult["category"] =
        hostname === "metadata.google.internal" || hostname === "metadata.azure.com"
          ? "metadata-endpoint"
          : "loopback";
      return { blocked: true, reason: `Hostname "${hostname}" is blocked`, url, category };
    }

    if (hostname.toLowerCase().endsWith(".local")) {
      return {
        blocked: true,
        reason: `Hostname "${hostname}" is a .local mDNS address`,
        url,
        category: "hostname-private",
      };
    }

    if (isIPv4(hostname)) {
      const cat = classifyIPv4(hostname);
      if (cat) {
        const category = hostname === "169.254.169.254" ? "metadata-endpoint" : cat;
        return { blocked: true, reason: `IP ${hostname} is in a blocked range`, url, category };
      }
    }

    if (isIPv6(parsed.hostname)) {
      const cat = classifyIPv6(parsed.hostname);
      if (cat) {
        return {
          blocked: true,
          reason: `IPv6 address ${parsed.hostname} is in a blocked range`,
          url,
          category: cat,
        };
      }
    }

    return { blocked: false, url };
  }

  checkArguments(args: Record<string, unknown>): SsrfResult {
    const urls = this.extractUrls(args);
    for (const url of urls) {
      const result = this.checkUrl(url);
      if (result.blocked) return result;
    }
    return { blocked: false };
  }

  static isInternal(url: string): boolean {
    return new SsrfGuard().checkUrl(url).blocked;
  }

  private extractUrls(value: unknown, seen: Set<unknown> = new Set()): string[] {
    if (seen.has(value)) return [];
    const urls: string[] = [];

    if (typeof value === "string") {
      if (URL_PREFIX_RE.test(value)) urls.push(value);
    } else if (Array.isArray(value)) {
      seen.add(value);
      for (const item of value) urls.push(...this.extractUrls(item, seen));
    } else if (value !== null && typeof value === "object") {
      seen.add(value);
      for (const v of Object.values(value as Record<string, unknown>))
        urls.push(...this.extractUrls(v, seen));
    }

    return urls;
  }
}
