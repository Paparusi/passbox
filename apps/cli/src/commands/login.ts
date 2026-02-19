import { Command } from 'commander';
import ora from 'ora';
import { saveAuth, getServerUrl } from '../lib/config.js';
import { printSuccess, printError } from '../lib/output.js';
import * as readline from 'node:readline';

function prompt(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (hidden) {
      // For password input
      process.stdout.write(question);
      let input = '';
      process.stdin.setRawMode?.(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      const onData = (char: string) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode?.(false);
          process.stdin.removeListener('data', onData);
          rl.close();
          console.log();
          resolve(input);
        } else if (char === '\u0003') {
          process.exit();
        } else if (char === '\u007F' || char === '\b') {
          input = input.slice(0, -1);
        } else {
          input += char;
        }
      };
      process.stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

export const loginCommand = new Command('login')
  .description('Login to PassBox')
  .option('--token <token>', 'Login with service token')
  .option('--server <url>', 'Server URL')
  .action(async (options) => {
    try {
      if (options.token) {
        // Service token login
        saveAuth({
          accessToken: options.token,
          refreshToken: '',
          expiresAt: '',
          email: 'service-token',
        });
        printSuccess('Logged in with service token');
        return;
      }

      // Interactive login
      const email = await prompt('Email: ');
      const password = await prompt('Master Password: ', true);
      const serverUrl = options.server || getServerUrl();

      const spinner = ora('Logging in...').start();

      const res = await fetch(`${serverUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json() as any;

      if (!data.success) {
        spinner.fail('Login failed: ' + (data.error?.message || 'Unknown error'));
        process.exit(1);
      }

      saveAuth({
        accessToken: data.data.session.accessToken,
        refreshToken: data.data.session.refreshToken,
        expiresAt: data.data.session.expiresAt,
        email,
      });

      spinner.succeed(`Logged in as ${chalk(email)}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

function chalk(text: string): string {
  return `\x1b[36m${text}\x1b[0m`;
}
