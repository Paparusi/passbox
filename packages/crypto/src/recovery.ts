import type { EncryptedBlob } from '@pabox/types';
import { generateRecoveryKey } from './keys.js';
import { encryptBytes, decryptBytes } from './symmetric.js';
import { toBase64, fromBase64 } from './utils.js';

/**
 * Create a recovery key and encrypt the master key with it.
 *
 * The recovery key is shown to the user ONCE as a base64 string.
 * They must save it offline. If they lose their master password,
 * they can use the recovery key to decrypt their master key.
 */
export function createRecoveryKey(masterKey: Uint8Array): {
  recoveryKey: string;
  encryptedMasterKey: EncryptedBlob;
} {
  const recoveryKeyBytes = generateRecoveryKey();
  const encryptedMasterKey = encryptBytes(masterKey, recoveryKeyBytes);
  const recoveryKey = toBase64(recoveryKeyBytes);

  return { recoveryKey, encryptedMasterKey };
}

/**
 * Recover the master key using the recovery key.
 */
export function recoverMasterKey(
  recoveryKeyString: string,
  encryptedMasterKey: EncryptedBlob,
): Uint8Array {
  const recoveryKeyBytes = fromBase64(recoveryKeyString);
  return decryptBytes(encryptedMasterKey, recoveryKeyBytes);
}
