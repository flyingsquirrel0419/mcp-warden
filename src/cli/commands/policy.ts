import type { Command } from "commander";
import { PolicySync } from "../../policy/PolicySync.js";

export function registerPolicyCommand(program: Command): void {
  const policy = program.command("policy").description("Manage policy files");

  policy
    .command("sync")
    .description("Sync policies from a remote Git repository")
    .requiredOption("-r, --repo <url>", "Git repository URL")
    .option("-b, --branch <branch>", "Branch to checkout")
    .option("--list", "List available policies after syncing")
    .action(async (options: { repo: string; branch?: string; list?: boolean }) => {
      const sync = new PolicySync();

      process.stdout.write(`Syncing policies from ${options.repo}...\n`);

      try {
        sync.syncRepo(options.repo, options.branch);
        process.stdout.write("Sync complete.\n");
      } catch (err) {
        process.stderr.write(`Sync failed: ${err instanceof Error ? err.message : String(err)}\n`);
        process.exit(1);
      }

      if (options.list) {
        const policies = sync.listPolicies(options.repo);
        if (policies.length === 0) {
          process.stdout.write("No policy files found in repository.\n");
          return;
        }

        process.stdout.write(
          `\nFound ${policies.length} polic${policies.length !== 1 ? "ies" : "y"}:\n`,
        );
        for (const p of policies) {
          process.stdout.write(`  ${p.name} — ${p.description}\n`);
        }
      }
    });

  policy
    .command("list")
    .description("List policies from a previously synced repository")
    .requiredOption("-r, --repo <url>", "Git repository URL")
    .action((options: { repo: string }) => {
      const sync = new PolicySync();
      const policies = sync.listPolicies(options.repo);

      if (policies.length === 0) {
        process.stdout.write("No policies found. Run `policy sync --repo <url>` first.\n");
        return;
      }

      process.stdout.write(
        `\n${policies.length} polic${policies.length !== 1 ? "ies" : "y"} available:\n`,
      );
      for (const p of policies) {
        process.stdout.write(`  ${p.name} — ${p.description}\n`);
      }
    });

  policy
    .command("apply")
    .description("Apply a policy from a synced repository")
    .requiredOption("-r, --repo <url>", "Git repository URL")
    .requiredOption("-p, --policy <name>", "Policy file name to apply")
    .action((options: { repo: string; policy: string }) => {
      const sync = new PolicySync();

      try {
        const appliedPath = sync.applyPolicy(options.repo, options.policy);
        process.stdout.write(`Applied policy: ${options.policy}\n`);
        process.stdout.write(`Saved to: ${appliedPath}\n`);
      } catch (err) {
        process.stderr.write(
          `Failed to apply policy: ${err instanceof Error ? err.message : String(err)}\n`,
        );
        process.exit(1);
      }
    });
}
