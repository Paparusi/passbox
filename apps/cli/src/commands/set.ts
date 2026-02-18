import { Command } from 'commander';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError } from '../lib/output.js';

export const setCommand = new Command('set')
  .description('Set a secret value')
  .argument('<name>', 'Secret name')
  .argument('[value]', 'Secret value (or use --from-stdin)')
  .option('-v, --vault <vault>', 'Vault name or ID')
  .option('--from-stdin', 'Read value from stdin')
  .option('-d, --description <desc>', 'Secret description')
  .option('-t, --tags <tags>', 'Comma-separated tags')
  .action(async (name: string, value: string | undefined, options) => {
    try {
      let secretValue = value;

      if (options.fromStdin || !secretValue) {
        // Read from stdin
        const chunks: Buffer[] = [];
        for await (const chunk of process.stdin) {
          chunks.push(chunk);
        }
        secretValue = Buffer.concat(chunks).toString('utf-8').trim();
      }

      if (!secretValue) {
        printError('No value provided. Pass as argument or use --from-stdin');
        process.exit(1);
      }

      const spinner = ora('Encrypting and saving...').start();
      const pb = getClient();

      await pb.secrets.set(name, secretValue, {
        vault: options.vault,
        description: options.description,
        tags: options.tags?.split(',').map((t: string) => t.trim()),
      });

      spinner.succeed(`Secret "${name}" saved`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
