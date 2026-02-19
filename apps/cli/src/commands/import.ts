import { Command } from 'commander';
import * as fs from 'node:fs';
import ora from 'ora';
import { getClient } from '../lib/client.js';
import { printSuccess, printError } from '../lib/output.js';

export const importCommand = new Command('import')
  .description('Import secrets from a file (auto-detects format from extension)')
  .argument('<file>', 'File to import (.env, .json, .csv)')
  .option('-v, --vault <vault>', 'Target vault')
  .option('-e, --env <environment>', 'Target environment')
  .option('-f, --format <format>', 'Force format: dotenv, json, csv (auto-detected from extension if omitted)')
  .action(async (file: string, options) => {
    try {
      if (!fs.existsSync(file)) {
        printError(`File not found: ${file}`);
        process.exit(1);
      }

      const content = fs.readFileSync(file, 'utf-8');
      const spinner = ora('Importing secrets...').start();
      const pb = getClient();

      let result;
      const format = options.format?.toLowerCase();

      if (format === 'json') {
        result = await pb.importers.fromJSON(content, { vault: options.vault, env: options.env });
      } else if (format === 'csv') {
        result = await pb.importers.fromCSV(content, { vault: options.vault, env: options.env });
      } else if (format === 'dotenv' || format === 'env') {
        result = await pb.importers.fromDotenv(content, { vault: options.vault, env: options.env });
      } else {
        result = await pb.importers.autoImport(content, file, { vault: options.vault, env: options.env });
      }

      spinner.succeed(
        `Import complete: ${result.created} created/updated` +
        (result.errors.length > 0 ? `, ${result.errors.length} errors` : '')
      );

      if (result.errors.length > 0) {
        console.log('\nErrors:');
        for (const error of result.errors) {
          printError(`  ${error}`);
        }
      }
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
