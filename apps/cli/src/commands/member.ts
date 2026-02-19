import { Command } from 'commander';
import ora from 'ora';
import {
  decryptBytes,
  decryptVaultKey,
  shareVaultKeyForUser,
  fromBase64,
  toBase64,
  type EncryptedBlob,
} from '@pabox/crypto';
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
      const pb = getClient();
      const masterKey = pb.getMasterKey();

      if (!masterKey) {
        printError('Master key not available. Login with email+password first: passbox login');
        process.exit(1);
      }

      const spinner = ora(`Inviting ${email}...`).start();

      // 1. Get our encryption keys from server
      spinner.text = 'Loading encryption keys...';
      const ourKeys = await pb.request<{
        publicKey: string;
        encryptedPrivateKey: string;
      }>('/auth/keys');

      // 2. Decrypt our private key
      const encPrivKey: EncryptedBlob = JSON.parse(ourKeys.encryptedPrivateKey);
      const ourPrivateKey = decryptBytes(encPrivKey, masterKey);

      // 3. Get vault data and decrypt vault key
      spinner.text = 'Decrypting vault key...';
      const vaults = await pb.vaults.list();
      const vault = options.vault
        ? vaults.find(v => v.name === options.vault || v.id === options.vault)
        : vaults[0];

      if (!vault) {
        spinner.fail('Vault not found');
        process.exit(1);
      }

      const vaultData = await pb.vaults.get(vault.id);
      if (!vaultData.encryptedVaultKey) {
        spinner.fail('Vault key not available');
        process.exit(1);
      }

      const encVaultKey: EncryptedBlob = JSON.parse(vaultData.encryptedVaultKey);
      const vaultKey = decryptVaultKey(encVaultKey, masterKey);

      // 4. Get target user's public key
      spinner.text = `Looking up ${email}...`;
      const targetPubKeyStr = await pb.members.getUserPublicKey(email);
      const targetPublicKey = fromBase64(targetPubKeyStr);

      // 5. X25519 ECDH key exchange to encrypt vault key for target user
      spinner.text = 'Sharing vault key...';
      const sharedKey = shareVaultKeyForUser(
        vaultKey,
        ourPrivateKey,
        targetPublicKey,
        ourKeys.publicKey,
      );

      // 6. Send invite with encrypted vault key
      await pb.members.add({
        email,
        role: options.role,
        encryptedVaultKey: JSON.stringify(sharedKey),
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
