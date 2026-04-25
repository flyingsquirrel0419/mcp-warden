#!/usr/bin/env node

export { McpProxy } from "./proxy/McpProxy.js";
export { HttpTransport } from "./proxy/HttpTransport.js";
export { StdioTransport } from "./proxy/StdioTransport.js";
export { PolicyEngine } from "./policy/PolicyEngine.js";
export { PolicySync, PolicySignatureError } from "./policy/PolicySync.js";
export { TrustedSigners } from "./policy/TrustedSigners.js";
export { SignatureVerifier } from "./policy/SignatureVerifier.js";
export { AuditLogger } from "./audit/AuditLogger.js";
export { ConfigManager } from "./utils/ConfigManager.js";
export { Logger } from "./utils/logger.js";
export * from "./utils/errors.js";
export * from "./policy/schema.js";

// CLI only runs when executed directly (not when imported as a library)
if (process.argv[1]?.endsWith("index.js") && !process.env.WARDEN_LIBRARY_MODE) {
  import("./cli/index.js").then(({ createProgram }) => {
    createProgram().parse();
  });
}
