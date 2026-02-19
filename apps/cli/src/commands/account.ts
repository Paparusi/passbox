import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { clearAuth } from '../lib/config.js';
import { printSuccess, printError } from '../lib/output.js';
import * as readline from 'node:readline';

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

export const accountCommand = new Command('account')
  .description('Manage your account');

accountCommand
  .command('delete')
  .description('Permanently delete your account and all data')
  .action(async () => {
    try {
      const confirmation = await prompt(
        'This will permanently delete your account, all vaults, secrets, and memberships.\n' +
        'Type "DELETE" to confirm: ',
      );

      if (confirmation !== 'DELETE') {
        console.log('Cancelled.');
        return;
      }

      const spinner = ora('Deleting account...').start();
      const pb = getClient();
      await pb.account.deleteAccount();
      clearAuth();
      spinner.succeed('Account deleted permanently');
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
