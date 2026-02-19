import * as core from '@actions/core';
import * as fs from 'fs';
import { PassBox } from '@pabox/sdk';

async function run(): Promise<void> {
  try {
    const token = core.getInput('token', { required: true });
    const vault = core.getInput('vault') || undefined;
    const environment = core.getInput('environment') || undefined;
    const secretsFilter = core.getInput('secrets') || undefined;
    const exportEnv = core.getInput('export-env') !== 'false';
    const envFile = core.getInput('env-file') || undefined;
    const serverUrl = core.getInput('server') || 'https://api.passbox.dev';

    core.info('Connecting to PassBox...');

    const pb = new PassBox({ serverUrl, token });

    // Fetch all secrets (decrypted)
    let secrets = await pb.secrets.getAll({ vault, env: environment });

    // Filter to specific secrets if requested
    if (secretsFilter) {
      const allowed = new Set(secretsFilter.split(',').map(s => s.trim()));
      secrets = Object.fromEntries(
        Object.entries(secrets).filter(([key]) => allowed.has(key))
      );
    }

    const count = Object.keys(secrets).length;
    core.info(`Loaded ${count} secret${count !== 1 ? 's' : ''}`);

    // Export as environment variables
    if (exportEnv) {
      for (const [name, value] of Object.entries(secrets)) {
        core.setSecret(value); // Mask the value in logs
        core.exportVariable(name, value);
      }
      core.info(`Exported ${count} secrets as environment variables`);
    }

    // Write to .env file
    if (envFile) {
      const envContent = Object.entries(secrets)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => {
          if (value.includes(' ') || value.includes('#') || value.includes('\n') || value.includes('"')) {
            return `${key}="${value.replace(/"/g, '\\"')}"`;
          }
          return `${key}=${value}`;
        })
        .join('\n') + '\n';

      fs.writeFileSync(envFile, envContent);
      core.info(`Wrote secrets to ${envFile}`);
    }

    core.setOutput('count', count);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    } else {
      core.setFailed('An unexpected error occurred');
    }
  }
}

run();
