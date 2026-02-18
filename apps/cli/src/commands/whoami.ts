import { Command } from 'commander';
import { getAuth, getConfig } from '../lib/config.js';
import { printError } from '../lib/output.js';

export const whoamiCommand = new Command('whoami')
  .description('Show current user info')
  .action(() => {
    const auth = getAuth();
    const config = getConfig();

    if (!auth) {
      printError('Not logged in. Run: passbox login');
      process.exit(1);
    }

    console.log(`Email:  ${auth.email}`);
    console.log(`Server: ${config.server}`);
    if (config.defaultVault) {
      console.log(`Vault:  ${config.defaultVault}`);
    }
  });
