import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError } from '../lib/output.js';

export const deleteCommand = new Command('delete')
  .description('Delete a secret')
  .argument('<name>', 'Secret name')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-e, --env <environment>', 'Environment name (e.g. development, staging, production)')
  .action(async (name: string, options) => {
    try {
      const spinner = ora('Deleting secret...').start();
      const pb = getClient();
      await pb.secrets.delete(name, { vault: options.vault, env: options.env });
      spinner.succeed(`Secret "${name}" deleted`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
