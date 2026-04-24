import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  PingRequestSchema,
  CompleteRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { InjectionDetector } from "../security/InjectionDetector.js";
import { SsrfGuard } from "../security/SsrfGuard.js";
import { DataLeakDetector } from "../security/DataLeakDetector.js";
import { Notifier } from "../daemon/Notifier.js";

export interface IPolicyEngine {
  evaluate(request: { server: string; tool: string; input: Record<string, unknown> }): {
    allowed: boolean;
    reason?: string;
    matchedRule?: string;
    mode: string;
  };
  isNewTool(server: string, tool: string): boolean;
}

export interface IAuditLogger {
  log(entry: {
    server: string;
    tool: string;
    input: Record<string, unknown>;
    output_size: number;
    duration_ms: number;
    blocked: boolean;
    block_reason?: string;
    policy_mode: string;
  }): void;
}

export interface RequestHandlerContext {
  client: Client;
  server: Server;
  serverName: string;
  policyEngine: IPolicyEngine;
  auditLogger: IAuditLogger;
  capabilities: Record<string, unknown>;
  requestTimeout?: number;
  injectionDetector?: InjectionDetector;
  ssrfGuard?: SsrfGuard;
  dataLeakDetector?: DataLeakDetector;
  notifier?: Notifier;
}

export class RequestHandler {
  private static toolsCache: Array<{ name: string; description?: string }> | null = null;

  static registerHandlers(ctx: RequestHandlerContext): void {
    if (ctx.capabilities.tools) {
      ctx.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
        return RequestHandler.handleToolList(ctx, request);
      });

      ctx.server.setRequestHandler(CallToolRequestSchema, async (request) => {
        return RequestHandler.handleToolCall(ctx, request);
      });
    }

    if (ctx.capabilities.prompts) {
      ctx.server.setRequestHandler(ListPromptsRequestSchema, async (request) => {
        return ctx.client.listPrompts(
          request.params,
          ctx.requestTimeout ? { timeout: ctx.requestTimeout } : undefined,
        );
      });
      ctx.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
        return ctx.client.getPrompt(
          request.params,
          ctx.requestTimeout ? { timeout: ctx.requestTimeout } : undefined,
        );
      });
    }

    if (ctx.capabilities.resources) {
      ctx.server.setRequestHandler(ListResourcesRequestSchema, async (request) => {
        return ctx.client.listResources(
          request.params,
          ctx.requestTimeout ? { timeout: ctx.requestTimeout } : undefined,
        );
      });
      ctx.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
        return ctx.client.readResource(
          request.params,
          ctx.requestTimeout ? { timeout: ctx.requestTimeout } : undefined,
        );
      });
    }

    ctx.server.setRequestHandler(PingRequestSchema, async () => {
      return {};
    });
  }

  private static async handleToolCall(
    ctx: RequestHandlerContext,
    request: { params: { name: string; arguments?: Record<string, unknown> } },
  ) {
    const toolName = request.params.name as string;
    const toolInput = (request.params.arguments as Record<string, unknown>) ?? {};
    const startTime = performance.now();

    const policyResult = ctx.policyEngine.evaluate({
      server: ctx.serverName,
      tool: toolName,
      input: toolInput,
    });

    if (!policyResult.allowed) {
      const duration = performance.now() - startTime;
      ctx.auditLogger.log({
        server: ctx.serverName,
        tool: toolName,
        input: toolInput,
        output_size: 0,
        duration_ms: duration,
        blocked: true,
        block_reason: policyResult.reason,
        policy_mode: policyResult.mode,
      });
      return {
        content: [{ type: "text" as const, text: `Blocked by Warden: ${policyResult.reason}` }],
        isError: true,
      };
    }

    // New tool notification
    if (ctx.policyEngine.isNewTool(ctx.serverName, toolName) && ctx.notifier) {
      ctx.notifier
        .notify({
          type: "new-tool",
          server: ctx.serverName,
          tool: toolName,
          message: `New tool detected: ${toolName} on ${ctx.serverName}`,
          severity: "info",
        })
        .catch(() => {});
    }

    // SSRF check on tool arguments (pre-call)
    if (ctx.ssrfGuard) {
      const ssrfResult = ctx.ssrfGuard.checkArguments(toolInput);
      if (ssrfResult.blocked) {
        const duration = performance.now() - startTime;
        ctx.auditLogger.log({
          server: ctx.serverName,
          tool: toolName,
          input: toolInput,
          output_size: 0,
          duration_ms: duration,
          blocked: true,
          block_reason: `SSRF risk: ${ssrfResult.reason}`,
          policy_mode: policyResult.mode,
        });
        if (ctx.notifier) {
          ctx.notifier
            .notify({
              type: "ssrf",
              server: ctx.serverName,
              tool: toolName,
              message: `SSRF attempt blocked: ${ssrfResult.reason}`,
              severity: "critical",
              details: { url: ssrfResult.url, category: ssrfResult.category },
            })
            .catch(() => {});
        }
        return {
          content: [
            {
              type: "text" as const,
              text: `Blocked by Warden: SSRF risk detected - ${ssrfResult.reason}`,
            },
          ],
          isError: true,
        };
      }
    }

    try {
      const response = await ctx.client.callTool(
        request.params,
        undefined,
        ctx.requestTimeout ? { timeout: ctx.requestTimeout } : undefined,
      );

      const duration = performance.now() - startTime;
      const responseSize = JSON.stringify(response).length;
      const responseText = JSON.stringify(response);

      // Injection detection on response (warn only, don't block)
      if (ctx.injectionDetector) {
        const injectionResult = ctx.injectionDetector.analyze(responseText);
        if (injectionResult.detected && injectionResult.severity !== "low") {
          if (ctx.notifier) {
            ctx.notifier
              .notify({
                type: "injection",
                server: ctx.serverName,
                tool: toolName,
                message: `Injection pattern detected in response (${injectionResult.severity})`,
                severity: injectionResult.severity === "high" ? "critical" : "warning",
                details: {
                  confidence: injectionResult.confidence,
                  patterns: injectionResult.patterns.map((p) => p.pattern),
                },
              })
              .catch(() => {});
          }
        }
      }

      // Data leak detection on response
      if (ctx.dataLeakDetector) {
        const leakResult = ctx.dataLeakDetector.analyze(response);
        if (leakResult.flagged) {
          if (leakResult.severity === "critical") {
            // Block the response
            ctx.auditLogger.log({
              server: ctx.serverName,
              tool: toolName,
              input: toolInput,
              output_size: responseSize,
              duration_ms: duration,
              blocked: true,
              block_reason: "Data leak detected (critical)",
              policy_mode: policyResult.mode,
            });
            if (ctx.notifier) {
              ctx.notifier
                .notify({
                  type: "data-leak",
                  server: ctx.serverName,
                  tool: toolName,
                  message: `Critical data leak blocked: ${leakResult.reasons.map((r) => r.detail).join("; ")}`,
                  severity: "critical",
                  details: { reasons: leakResult.reasons },
                })
                .catch(() => {});
            }
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Blocked by Warden: Data leak detected - ${leakResult.reasons.map((r) => r.detail).join("; ")}`,
                },
              ],
              isError: true,
            };
          }
          // Non-critical: just notify
          if (ctx.notifier) {
            ctx.notifier
              .notify({
                type: "data-leak",
                server: ctx.serverName,
                tool: toolName,
                message: `Data leak warning: ${leakResult.reasons.map((r) => r.detail).join("; ")}`,
                severity: leakResult.severity === "warning" ? "warning" : "info",
                details: { reasons: leakResult.reasons },
              })
              .catch(() => {});
          }
        }
      }

      ctx.auditLogger.log({
        server: ctx.serverName,
        tool: toolName,
        input: toolInput,
        output_size: responseSize,
        duration_ms: duration,
        blocked: false,
        policy_mode: policyResult.mode,
      });

      return response;
    } catch (err) {
      const duration = performance.now() - startTime;
      ctx.auditLogger.log({
        server: ctx.serverName,
        tool: toolName,
        input: toolInput,
        output_size: 0,
        duration_ms: duration,
        blocked: false,
        policy_mode: policyResult.mode,
      });
      throw err;
    }
  }

  private static async handleToolList(
    ctx: RequestHandlerContext,
    request: { params?: Record<string, unknown> },
  ): Promise<{ tools: Array<{ name: string; description?: string }> }> {
    if (RequestHandler.toolsCache) {
      return { tools: RequestHandler.toolsCache };
    }
    const result = await ctx.client.listTools(
      request.params,
      ctx.requestTimeout ? { timeout: ctx.requestTimeout } : undefined,
    );
    RequestHandler.toolsCache = result.tools;
    return result;
  }

  static clearCache(): void {
    RequestHandler.toolsCache = null;
  }
}
