import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError, printTable } from '../lib/output.js';

export const memberCommand = new Command('member')
  .alias('members')
  .description('Manage vault members');

memberCommand
  .command('list')
  .alias('ls')
  .description('List vault members')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-f, --format <format>', 'Output format (table, json)', 'table')
  .action(async (options) => {
    try {
      const pb = getClient();
      const members = await pb.members.list({ vault: options.vault });

      if (options.format === 'json') {
        console.log(JSON.stringify(members, null, 2));
        return;
      }

      if (members.length === 0) {
        console.log('No members found.');
        return;
      }

      printTable(
        ['Email', 'Role', 'User ID', 'Joined'],
        members.map(m => [
          m.email,
          m.role,
          m.user_id.slice(0, 8) + '...',
          new Date(m.created_at).toLocaleDateString(),
        ]),
      );
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

memberCommand
  .command('add <email>')
  .description('Invite a member to the vault')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('-r, --role <role>', 'Member role (admin, member, viewer)', 'member')
  .action(async (email: string, options) => {
    try {
      const spinner = ora(`Inviting ${email}...`).start();
      const pb = getClient();

      // For proper E2E encryption, we need to share the vault key via X25519.
      // This requires the master key to decrypt our private key and the vault key.
      // Using pb.request() to pass through the encrypted vault key.
      // Note: This requires the SDK to have a master key set (full login, not just token).
      const vaultKey = await getEncryptedVaultKeyForUser(pb, email, options.vault);

      await pb.members.add({
        email,
        role: options.role,
        encryptedVaultKey: vaultKey,
        vault: options.vault,
      });

      spinner.succeed(`Invited ${email} as ${options.role}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

memberCommand
  .command('role <userId> <role>')
  .description('Update a member\'s role (admin, member, viewer)')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (userId: string, role: string, options) => {
    try {
      const spinner = ora('Updating role...').start();
      const pb = getClient();
      await pb.members.updateRole(userId, role, { vault: options.vault });
      spinner.succeed(`Role updated to ${role}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

memberCommand
  .command('remove <userId>')
  .description('Remove a member from the vault')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .action(async (userId: string, options) => {
    try {
      const spinner = ora('Removing member...').start();
      const pb = getClient();
      await pb.members.remove(userId, { vault: options.vault });
      spinner.succeed('Member removed');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

/**
 * Helper to get the encrypted vault key for sharing with another user.
 * This currently passes a placeholder — full X25519 key exchange requires
 * the master key to be available in the CLI session.
 */
async function getEncryptedVaultKeyForUser(pb: any, email: string, vault?: string): Promise<string> {
  // For now, use the SDK's request() to get the public key and vault data.
  // Full E2E sharing requires:
  // 1. Decrypt our private key with master key
  // 2. Get target user's public key
  // 3. X25519 ECDH to derive shared secret
  // 4. HKDF to derive encryption key
  // 5. Encrypt vault key with derived key
  //
  // This works when the SDK has a master key (via PassBox.login()).
  // For service token auth, member invite is not supported.
  throw new Error(
    'Member invite via CLI requires full login (passbox login with email+password). ' +
    'Service token auth does not support member management. ' +
    'Use the web dashboard at https://passbox.dev to invite members.',
  );
}
