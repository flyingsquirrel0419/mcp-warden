import type { Command } from "commander";

export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Start the Warden CLI web dashboard")
    .option("-p, --port <number>", "Port to run on", "4242")
    .action(async (options: { port: string }) => {
      const { DashboardServer } = await import("../../dashboard/server.js");
      const server = new DashboardServer(parseInt(options.port, 10));
      await server.start();

      process.on("SIGINT", async () => {
        await server.stop();
        process.exit(0);
      });
      process.on("SIGTERM", async () => {
        await server.stop();
        process.exit(0);
      });
    });
}
