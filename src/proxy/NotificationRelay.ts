import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { LoggingMessageNotificationSchema } from "@modelcontextprotocol/sdk/types.js";

export class NotificationRelay {
  static wire(client: Client, server: Server, capabilities: Record<string, unknown>): void {
    if (capabilities.logging) {
      client.setNotificationHandler(LoggingMessageNotificationSchema, async (n) => {
        await server.notification(n);
      });
      server.setNotificationHandler(LoggingMessageNotificationSchema, async (n) => {
        await client.notification(n);
      });
    }
  }
}
