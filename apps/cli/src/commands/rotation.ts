import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError } from '../lib/output.js';

export const rotationCommand = new Command('rotation')
  .description('Manage secret rotation');

rotationCommand
  .command('get <secret>')
  .description('Get rotation config for a secret')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (secret: string, options) => {
    try {
      const pb = getClient();
      const config = await pb.rotation.get(secret, { vault: options.vault });

      if (!config) {
        console.log(`No rotation configured for "${secret}".`);
        return;
      }

      if (options.format === 'json') {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log(`Rotation config for "${secret}":`);
      console.log(`  Interval: ${config.interval_hours} hours`);
      console.log(`  Enabled:  ${config.enabled ? 'Yes' : 'No'}`);
      console.log(`  Last rotated: ${config.last_rotated_at ? new Date(config.last_rotated_at).toLocaleString() : 'Never'}`);
      console.log(`  Next rotation: ${config.next_rotation_at ? new Date(config.next_rotation_at).toLocaleString() : '-'}`);
      if (config.webhook_id) {
        console.log(`  Webhook ID: ${config.webhook_id}`);
      }
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

rotationCommand
  .command('set <secret>')
  .description('Set or update rotation config')
  .requiredOption('-i, --interval <hours>', 'Rotation interval in hours')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-w, --webhook <id>', 'Webhook ID to trigger on rotation')
  .option('--enable', 'Enable rotation (default)')
  .option('--disable', 'Disable rotation')
  .action(async (secret: string, options) => {
    try {
      const intervalHours = parseInt(options.interval, 10);
      if (isNaN(intervalHours) || intervalHours < 1) {
        printError('Interval must be a positive number of hours');
        process.exit(1);
      }

      const spinner = ora(`Setting rotation for "${secret}"...`).start();
      const pb = getClient();

      const enabled = options.disable ? false : true;
      await pb.rotation.set(secret, {
        intervalHours,
        webhookId: options.webhook || undefined,
        enabled,
        vault: options.vault,
      });

      spinner.succeed(`Rotation set: every ${intervalHours} hours`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

rotationCommand
  .command('remove <secret>')
  .description('Remove rotation config from a secret')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (secret: string, options) => {
    try {
      const spinner = ora('Removing rotation config...').start();
      const pb = getClient();
      await pb.rotation.remove(secret, { vault: options.vault });
      spinner.succeed('Rotation config removed');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

rotationCommand
  .command('trigger <secret>')
  .description('Manually trigger a rotation event')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (secret: string, options) => {
    try {
      const spinner = ora('Triggering rotation...').start();
      const pb = getClient();
      const result = await pb.rotation.trigger(secret, { vault: options.vault });
      spinner.succeed(`Rotation triggered at ${new Date(result.rotatedAt).toLocaleString()}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
