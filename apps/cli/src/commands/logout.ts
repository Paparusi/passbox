import { Command } from 'commander';
import { clearAuth } from '../lib/config.js';
import { printSuccess } from '../lib/output.js';

export const logoutCommand = new Command('logout')
  .description('Logout from PassBox')
  .action(() => {
    clearAuth();
    printSuccess('Logged out');
  });
