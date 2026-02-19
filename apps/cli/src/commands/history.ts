import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { printError, printTable } from '../lib/output.js';

export const historyCommand = new Command('history')
  .description('Show version history for a secret')
  .argument('<name>', 'Secret name')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-e, --env <environment>', 'Environment name')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (name: string, options) => {
    try {
      const pb = getClient();
      const versions = await pb.secrets.versions(name, {
        vault: options.vault,
        env: options.env,
      });

      if (options.format === 'json') {
        console.log(JSON.stringify(versions, null, 2));
        return;
      }

      if (versions.length === 0) {
        console.log(`No version history found for "${name}".`);
        return;
      }

      printTable(
        ['Version', 'Created By', 'Created At'],
        versions.map(v => [
          `v${v.version}`,
          v.created_by.slice(0, 8) + '...',
          new Date(v.created_at).toLocaleString(),
        ]),
      );

      console.log(`\n${versions.length} version${versions.length !== 1 ? 's' : ''} total`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
