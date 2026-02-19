import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError, printTable } from '../lib/output.js';

export const environmentCommand = new Command('environment')
  .alias('envs')
  .description('Manage vault environments (dev, staging, production)');

environmentCommand
  .command('list')
  .alias('ls')
  .description('List environments in a vault')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pb = getClient();
      const envs = await pb.environments.list({ vault: options.vault });

      if (options.format === 'json') {
        console.log(JSON.stringify(envs, null, 2));
        return;
      }

      if (envs.length === 0) {
        console.log('No environments found.');
        return;
      }

      printTable(
        ['Name', 'Default', 'Description', 'Created'],
        envs.map(e => [
          e.name,
          e.is_default ? 'Yes' : '',
          e.description || '-',
          new Date(e.created_at).toLocaleDateString(),
        ]),
      );
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

environmentCommand
  .command('create <name>')
  .description('Create a new environment')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-d, --description <desc>', 'Environment description')
  .action(async (name: string, options) => {
    try {
      const spinner = ora(`Creating environment "${name}"...`).start();
      const pb = getClient();
      await pb.environments.create(name, {
        vault: options.vault,
        description: options.description,
      });
      spinner.succeed(`Environment "${name}" created`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

environmentCommand
  .command('delete <name>')
  .description('Delete an environment (cannot delete default)')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (name: string, options) => {
    try {
      const pb = getClient();
      const envId = await pb.environments.resolve(name, { vault: options.vault });
      const spinner = ora(`Deleting environment "${name}"...`).start();
      await pb.environments.delete(envId, { vault: options.vault });
      spinner.succeed(`Environment "${name}" deleted`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

environmentCommand
  .command('clone <target>')
  .description('Clone secrets from one environment to another')
  .requiredOption('--from <source>', 'Source environment name')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (target: string, options) => {
    try {
      const pb = getClient();
      const targetId = await pb.environments.resolve(target, { vault: options.vault });
      const fromId = await pb.environments.resolve(options.from, { vault: options.vault });
      const spinner = ora(`Cloning from "${options.from}" to "${target}"...`).start();
      const result = await pb.environments.clone(targetId, fromId, { vault: options.vault });
      spinner.succeed(`Cloned ${result.created} secrets from "${options.from}" to "${target}"`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
