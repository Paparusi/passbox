import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { setConfig } from '../lib/config.js';
import { printSuccess, printError, printTable } from '../lib/output.js';

export const vaultCommand = new Command('vault')
  .description('Manage vaults');

vaultCommand
  .command('create <name>')
  .description('Create a new vault')
  .option('-d, --description <desc>', 'Vault description')
  .action(async (name: string, options) => {
    try {
      const spinner = ora('Creating vault...').start();
      const pb = getClient();
      const vault = await pb.vaults.create({
        name,
        description: options.description,
      });
      spinner.succeed(`Vault "${name}" created`);
      console.log(`  ID: ${vault.id}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

vaultCommand
  .command('list')
  .alias('ls')
  .description('List all vaults')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pb = getClient();
      const vaultList = await pb.vaults.list();

      if (options.format === 'json') {
        console.log(JSON.stringify(vaultList, null, 2));
        return;
      }

      if (vaultList.length === 0) {
        console.log('No vaults found. Create one: passbox vault create <name>');
        return;
      }

      printTable(
        ['Name', 'ID', 'Role', 'Created'],
        vaultList.map(v => [
          v.name,
          v.id.slice(0, 8) + '...',
          v.role || '-',
          new Date(v.created_at).toLocaleDateString(),
        ]),
      );
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

vaultCommand
  .command('delete <name>')
  .description('Delete a vault')
  .action(async (name: string) => {
    try {
      const pb = getClient();
      const vaultList = await pb.vaults.list();
      const vault = vaultList.find(v => v.name === name);
      if (!vault) {
        printError(`Vault "${name}" not found`);
        process.exit(1);
      }
      const spinner = ora('Deleting vault...').start();
      await pb.vaults.delete(vault.id);
      spinner.succeed(`Vault "${name}" deleted`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

vaultCommand
  .command('use <name>')
  .description('Set default vault')
  .action((name: string) => {
    setConfig({ defaultVault: name });
    printSuccess(`Default vault set to "${name}"`);
  });
