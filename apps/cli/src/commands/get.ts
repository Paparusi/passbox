import { Command } from 'commander';
import { getClient } from '../lib/client.js';
import { printError } from '../lib/output.js';

export const getCommand = new Command('get')
  .description('Get a secret value')
  .argument('<name>', 'Secret name')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-f, --format <format>', 'Output format (plain, json)', 'plain')
  .action(async (name: string, options) => {
    try {
      const pb = getClient();
      const value = await pb.secrets.get(name, { vault: options.vault });

      if (options.format === 'json') {
        console.log(JSON.stringify({ name, value }));
      } else {
        process.stdout.write(value);
        // Add newline only if stdout is a TTY
        if (process.stdout.isTTY) {
          console.log();
        }
      }
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
