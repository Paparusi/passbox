import { Command } from 'commander';
import { spawn } from 'node:child_process';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printError } from '../lib/output.js';

export const runCommand = new Command('run')
  .description('Run a command with injected secrets as env vars')
  .option('-v, --vault <vault>', 'Vault to inject from')
  .option('-e, --env <environment>', 'Environment name (e.g. development, staging, production)')
  .argument('<command...>', 'Command to run')
  .allowUnknownOption()
  .action(async (commandArgs: string[], options) => {
    try {
      const pb = getClient();
      const spinner = ora('Loading secrets...').start();
      const secrets = await pb.secrets.getAll({ vault: options.vault, env: options.env });
      spinner.succeed(`Loaded ${Object.keys(secrets).length} secrets`);

      const [cmd, ...args] = commandArgs;

      const child = spawn(cmd, args, {
        stdio: 'inherit',
        env: { ...process.env, ...secrets },
      });

      child.on('exit', (code) => {
        process.exit(code ?? 0);
      });

      child.on('error', (err) => {
        printError(`Failed to run command: ${err.message}`);
        process.exit(1);
      });
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
