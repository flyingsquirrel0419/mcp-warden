// Standalone MCP server on stdio. Spawn via: npx tsx tests/helpers/fake-mcp-server.ts

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const server = new Server(
  { name: "fake-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      description: "Echo back the input message",
      inputSchema: {
        type: "object" as const,
        properties: {
          message: { type: "string", description: "The message to echo back" },
        },
        required: ["message"],
      },
    },
    {
      name: "add",
      description: "Add two numbers together",
      inputSchema: {
        type: "object" as const,
        properties: {
          a: { type: "number", description: "First number" },
          b: { type: "number", description: "Second number" },
        },
        required: ["a", "b"],
      },
    },
    {
      name: "greet",
      description: "Return a greeting for a given name",
      inputSchema: {
        type: "object" as const,
        properties: {
          name: { type: "string", description: "The name to greet" },
        },
        required: ["name"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const input = args ?? {};

  switch (name) {
    case "echo":
      return {
        content: [
          {
            type: "text" as const,
            text: String(input.message ?? ""),
          },
        ],
      };

    case "add": {
      const a = Number(input.a ?? 0);
      const b = Number(input.b ?? 0);
      return {
        content: [
          {
            type: "text" as const,
            text: String(a + b),
          },
        ],
      };
    }

    case "greet":
      return {
        content: [
          {
            type: "text" as const,
            text: `Hello, ${input.name ?? "world"}!`,
          },
        ],
      };

    default:
      return {
        content: [
          {
            type: "text" as const,
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  process.stderr.write(`Fake MCP server error: ${err}\n`);
  process.exit(1);
});
