import { Command } from 'commander';
import ora from 'ora';
import { encryptBytes, toBase64 } from '@pabox/crypto';
import { getClient } from '../lib/client.js';
import { printSuccess, printError, printTable, printWarning } from '../lib/output.js';

export const tokenCommand = new Command('token')
  .alias('tokens')
  .description('Manage service tokens');

tokenCommand
  .command('list')
  .alias('ls')
  .description('List your service tokens')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pb = getClient();
      const tokens = await pb.tokens.list();

      if (options.format === 'json') {
        console.log(JSON.stringify(tokens, null, 2));
        return;
      }

      if (tokens.length === 0) {
        console.log('No service tokens found. Create one: passbox token create <name>');
        return;
      }

      printTable(
        ['Name', 'ID', 'Prefix', 'Permissions', 'Expires', 'Created'],
        tokens.map(t => [
          t.name,
          t.id.slice(0, 8) + '...',
          t.token_prefix + '...',
          t.permissions.join(', '),
          t.expires_at ? new Date(t.expires_at).toLocaleDateString() : 'Never',
          new Date(t.created_at).toLocaleDateString(),
        ]),
      );
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

tokenCommand
  .command('create <name>')
  .description('Create a new service token')
  .option('-p, --permissions <perms>', 'Comma-separated permissions (read,write,list,delete)', 'read,list')
  .option('--vault-ids <ids>', 'Comma-separated vault IDs to scope the token to')
  .option('--expires <date>', 'Expiration date (ISO 8601)')
  .action(async (name: string, options) => {
    try {
      const permissions = options.permissions.split(',').map((p: string) => p.trim());
      const validPerms = ['read', 'write', 'list', 'delete'];
      const invalid = permissions.filter((p: string) => !validPerms.includes(p));
      if (invalid.length > 0) {
        printError(`Invalid permissions: ${invalid.join(', ')}. Valid: ${validPerms.join(', ')}`);
        process.exit(1);
      }

      const vaultIds = options.vaultIds ? options.vaultIds.split(',').map((id: string) => id.trim()) : undefined;

      const pb = getClient();

      // Get master key — required for encrypting the token's master key copy
      const masterKey = pb.getMasterKey();
      if (!masterKey) {
        printError('Master key not available. Login with email+password first: passbox login');
        process.exit(1);
      }

      // Encrypt master key so the service token can decrypt secrets
      const encryptedMk = encryptBytes(masterKey, masterKey);
      const encryptedMasterKey = JSON.stringify(encryptedMk);

      const spinner = ora('Creating service token...').start();

      const result = await pb.tokens.create({
        name,
        permissions,
        vaultIds,
        expiresAt: options.expires,
        encryptedMasterKey,
      });

      spinner.succeed('Service token created');
      console.log('');
      console.log(`  Token: ${result.token}`);
      console.log('');
      printWarning('Save this token — it will not be shown again!');
      console.log(`  Use: passbox login --token ${result.token}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

tokenCommand
  .command('revoke <id>')
  .description('Revoke (delete) a service token')
  .action(async (id: string) => {
    try {
      const spinner = ora('Revoking token...').start();
      const pb = getClient();
      await pb.tokens.revoke(id);
      spinner.succeed('Service token revoked');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
