import { Command } from 'commander';
import { saveProjectConfig, getServerUrl } from '../lib/config.js';
import { printSuccess } from '../lib/output.js';

export const initCommand = new Command('init')
  .description('Initialize PassBox for this project')
  .option('--vault <name>', 'Default vault for this project')
  .option('--server <url>', 'Server URL')
  .action((options) => {
    saveProjectConfig({
      vault: options.vault,
      server: options.server || getServerUrl(),
    });
    printSuccess('Created .passbox.json');
    if (options.vault) {
      console.log(`  Default vault: ${options.vault}`);
    }
  });
