import { Command } from 'commander';
import { getConfig, setConfig } from '../lib/config.js';
import { printSuccess, printError } from '../lib/output.js';

export const configCommand = new Command('config')
  .description('Manage CLI configuration');

configCommand
  .command('set <key> <value>')
  .description('Set a config value (server, default-vault)')
  .action((key: string, value: string) => {
    const keyMap: Record<string, string> = {
      'server': 'server',
      'default-vault': 'defaultVault',
      'defaultVault': 'defaultVault',
    };

    const configKey = keyMap[key];
    if (!configKey) {
      printError(`Unknown config key: ${key}. Valid: server, default-vault`);
      process.exit(1);
    }

    setConfig({ [configKey]: value });
    printSuccess(`${key} = ${value}`);
  });

configCommand
  .command('get [key]')
  .description('Get config value(s)')
  .action((key?: string) => {
    const config = getConfig();

    if (key) {
      const value = (config as Record<string, unknown>)[key];
      if (value !== undefined) {
        console.log(value);
      } else {
        printError(`Unknown key: ${key}`);
      }
    } else {
      console.log(JSON.stringify(config, null, 2));
    }
  });
