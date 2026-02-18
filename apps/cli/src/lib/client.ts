import { PassBox } from '@passbox/sdk';
import { deriveMasterKey } from '@passbox/crypto';
import { fromBase64 } from '@passbox/crypto';
import { getAuth, getServerUrl, getDefaultVault } from './config.js';

/**
 * Get an authenticated PassBox client for CLI commands.
 */
export function getClient(): PassBox {
  const auth = getAuth();
  const serverUrl = getServerUrl();

  if (!auth) {
    console.error('Not logged in. Run: passbox login');
    process.exit(1);
  }

  const pb = new PassBox({
    serverUrl,
    token: auth.accessToken,
  });

  const defaultVault = getDefaultVault();
  if (defaultVault) {
    pb.setDefaultVault(defaultVault);
  }

  return pb;
}
