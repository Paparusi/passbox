import { Command } from 'commander';
import * as fs from 'node:fs';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError } from '../lib/output.js';

export const envCommand = new Command('env')
  .description('Import/export secrets as .env files');

envCommand
  .command('push <file>')
  .description('Import .env file into vault')
  .option('-v, --vault <vault>', 'Target vault')
  .action(async (file: string, options) => {
    try {
      if (!fs.existsSync(file)) {
        printError(`File not found: ${file}`);
        process.exit(1);
      }

      const content = fs.readFileSync(file, 'utf-8');
      const spinner = ora('Importing secrets...').start();
      const pb = getClient();
      const result = await pb.env.import(content, { vault: options.vault });
      spinner.succeed(`Imported ${result.created + result.updated} secrets from ${file}`);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });

envCommand
  .command('pull')
  .description('Export vault secrets as .env')
  .option('-v, --vault <vault>', 'Source vault')
  .option('-o, --output <file>', 'Output file (default: stdout)')
  .action(async (options) => {
    try {
      const pb = getClient();
      const spinner = ora('Exporting secrets...').start();
      const envContent = await pb.env.export({ vault: options.vault });
      spinner.stop();

      if (options.output) {
        fs.writeFileSync(options.output, envContent + '\n');
        printSuccess(`Exported to ${options.output}`);
      } else {
        console.log(envContent);
      }
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
