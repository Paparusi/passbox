import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError, printTable } from '../lib/output.js';

const VALID_EVENTS = ['secret.created', 'secret.updated', 'secret.deleted', 'secret.rotated'];

export const webhookCommand = new Command('webhook')
  .alias('webhooks')
  .description('Manage vault webhooks');

webhookCommand
  .command('list')
  .alias('ls')
  .description('List webhooks in a vault')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pb = getClient();
      const webhooks = await pb.webhooks.list({ vault: options.vault });

      if (options.format === 'json') {
        console.log(JSON.stringify(webhooks, null, 2));
        return;
      }

      if (webhooks.length === 0) {
        console.log('No webhooks found. Create one: passbox webhook create <name> --url <url>');
        return;
      }

      printTable(
        ['Name', 'URL', 'Events', 'Active', 'Last Triggered'],
        webhooks.map(w => [
          w.name,
          w.url.length > 40 ? w.url.slice(0, 37) + '...' : w.url,
          w.events.join(', '),
          w.active ? 'Yes' : 'No',
          w.last_triggered_at ? new Date(w.last_triggered_at).toLocaleDateString() : 'Never',
        ]),
      );
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

webhookCommand
  .command('create <name>')
  .description('Create a new webhook')
  .requiredOption('-u, --url <url>', 'Webhook URL (HTTPS only)')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-e, --events <events>', 'Comma-separated events to subscribe to', VALID_EVENTS.join(','))
  .action(async (name: string, options) => {
    try {
      const events = options.events.split(',').map((e: string) => e.trim());
      const invalid = events.filter((e: string) => !VALID_EVENTS.includes(e));
      if (invalid.length > 0) {
        printError(`Invalid events: ${invalid.join(', ')}. Valid: ${VALID_EVENTS.join(', ')}`);
        process.exit(1);
      }

      const spinner = ora(`Creating webhook "${name}"...`).start();
      const pb = getClient();
      const webhook = await pb.webhooks.create({
        name,
        url: options.url,
        events,
        vault: options.vault,
      });
      spinner.succeed(`Webhook "${name}" created`);
      console.log(`  ID: ${webhook.id}`);
      console.log(`  Signing secret: ${webhook.signing_secret}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

webhookCommand
  .command('update <id>')
  .description('Update a webhook')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-n, --name <name>', 'New name')
  .option('-u, --url <url>', 'New URL')
  .option('-e, --events <events>', 'New events (comma-separated)')
  .option('--enable', 'Enable webhook')
  .option('--disable', 'Disable webhook')
  .action(async (id: string, options) => {
    try {
      const updates: any = { vault: options.vault };
      if (options.name) updates.name = options.name;
      if (options.url) updates.url = options.url;
      if (options.events) updates.events = options.events.split(',').map((e: string) => e.trim());
      if (options.enable) updates.active = true;
      if (options.disable) updates.active = false;

      const spinner = ora('Updating webhook...').start();
      const pb = getClient();
      await pb.webhooks.update(id, updates);
      spinner.succeed('Webhook updated');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

webhookCommand
  .command('delete <id>')
  .description('Delete a webhook')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (id: string, options) => {
    try {
      const spinner = ora('Deleting webhook...').start();
      const pb = getClient();
      await pb.webhooks.delete(id, { vault: options.vault });
      spinner.succeed('Webhook deleted');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

webhookCommand
  .command('test <id>')
  .description('Send a test event to a webhook')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (id: string, options) => {
    try {
      const spinner = ora('Sending test event...').start();
      const pb = getClient();
      await pb.webhooks.test(id, { vault: options.vault });
      spinner.succeed('Test event sent');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
