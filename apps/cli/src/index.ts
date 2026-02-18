import { Command } from 'commander';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { initCommand } from './commands/init.js';
import { vaultCommand } from './commands/vault.js';
import { getCommand } from './commands/get.js';
import { setCommand } from './commands/set.js';
import { deleteCommand } from './commands/delete.js';
import { listCommand } from './commands/list.js';
import { envCommand } from './commands/env.js';
import { runCommand } from './commands/run.js';
import { whoamiCommand } from './commands/whoami.js';
import { configCommand } from './commands/config.js';
import { serveCommand } from './commands/serve.js';

const program = new Command();

program
  .name('passbox')
  .description('Zero-knowledge secrets management for developers and AI agents')
  .version('0.1.0');

// Register commands
program.addCommand(initCommand);
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(vaultCommand);
program.addCommand(getCommand);
program.addCommand(setCommand);
program.addCommand(deleteCommand);
program.addCommand(listCommand);
program.addCommand(envCommand);
program.addCommand(runCommand);
program.addCommand(whoamiCommand);
program.addCommand(configCommand);
program.addCommand(serveCommand);

program.parse();
