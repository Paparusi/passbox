import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { printError, printTable } from '../lib/output.js';

export const listCommand = new Command('list')
  .alias('ls')
  .description('List secrets in a vault')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pb = getClient();
      const secrets = await pb.secrets.list({ vault: options.vault });

      if (options.format === 'json') {
        console.log(JSON.stringify(secrets, null, 2));
        return;
      }

      if (secrets.length === 0) {
        console.log('No secrets found. Add one: passbox set <name> <value>');
        return;
      }

      printTable(
        ['Name', 'Version', 'Tags', 'Updated'],
        secrets.map(s => [
          s.name,
          `v${s.version}`,
          s.tags.join(', ') || '-',
          new Date(s.updated_at).toLocaleDateString(),
        ]),
      );
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
