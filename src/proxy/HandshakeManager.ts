export interface HandshakeResult {
  serverVersion: { name: string; version: string };
  serverCapabilities: Record<string, unknown>;
}

export class HandshakeManager {
  /**
   * Transform upstream capabilities for the downstream server.
   * - Mirror tools, resources, prompts from upstream
   * - Always add logging capability (for audit)
   */
  static transformCapabilities(upstream: Record<string, unknown>): Record<string, unknown> {
    const transformed: Record<string, unknown> = {};

    // Mirror tool capabilities
    if (upstream.tools) {
      transformed.tools = { ...upstream.tools };
    }

    // Mirror prompt capabilities
    if (upstream.prompts) {
      transformed.prompts = { ...upstream.prompts };
    }

    // Mirror resource capabilities (including subscribe flag)
    if (upstream.resources) {
      transformed.resources = { ...upstream.resources };
    }

    // Always add logging (for audit trail)
    transformed.logging = {};

    // Do NOT forward sampling capability — we're a proxy, not an LLM

    return transformed;
  }
}
