import { PassBox } from '@pabox/sdk';
import { fromBase64 } from '@pabox/crypto';
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

  // Restore master key from login session (stored as base64 in auth.json)
  if (auth.masterKeyEncrypted) {
    try {
      const masterKey = fromBase64(auth.masterKeyEncrypted);
      pb.setMasterKey(masterKey);
    } catch {
      // Master key unavailable — E2E crypto operations will fail
    }
  }

  return pb;
}
