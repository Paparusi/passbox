import type { EncryptedBlob } from '@passbox/types';
import { generateVaultKey } from './keys.js';
import { encrypt, decrypt, encryptBytes, decryptBytes } from './symmetric.js';
import { deriveSharedKey } from './asymmetric.js';
import { toBase64, fromBase64 } from './utils.js';

/**
 * Create a new vault with an encrypted vault key.
 *
 * Flow:
 * 1. Generate random vault key
 * 2. Encrypt vault key with user's master key
 * 3. Return both for storage
 */
export function createVaultKey(masterKey: Uint8Array): {
  vaultKey: Uint8Array;
  encryptedVaultKey: EncryptedBlob;
} {
  const vaultKey = generateVaultKey();
  const encryptedVaultKey = encryptBytes(vaultKey, masterKey);
  return { vaultKey, encryptedVaultKey };
}

/**
 * Decrypt a vault key using the user's master key.
 */
export function decryptVaultKey(
  encryptedVaultKey: EncryptedBlob,
  masterKey: Uint8Array,
): Uint8Array {
  return decryptBytes(encryptedVaultKey, masterKey);
}

/**
 * Encrypt a secret value using the vault key.
 */
export function encryptSecret(value: string, vaultKey: Uint8Array): EncryptedBlob {
  return encrypt(value, vaultKey);
}

/**
 * Decrypt a secret value using the vault key.
 */
export function decryptSecret(blob: EncryptedBlob, vaultKey: Uint8Array): string {
  return decrypt(blob, vaultKey);
}

/**
 * Wrap a vault key for sharing with another user.
 *
 * Uses X25519 key exchange:
 * 1. Derive shared AES key from (my private key, their public key)
 * 2. Encrypt the vault key with the shared AES key
 */
export function wrapVaultKeyForSharing(
  vaultKey: Uint8Array,
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): EncryptedBlob {
  const sharedKey = deriveSharedKey(myPrivateKey, theirPublicKey);
  return encryptBytes(vaultKey, sharedKey);
}

/**
 * Unwrap a vault key received from another user.
 *
 * Uses X25519 key exchange:
 * 1. Derive shared AES key from (my private key, their public key)
 * 2. Decrypt the vault key with the shared AES key
 */
export function unwrapSharedVaultKey(
  wrappedVaultKey: EncryptedBlob,
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  const sharedKey = deriveSharedKey(myPrivateKey, theirPublicKey);
  return decryptBytes(wrappedVaultKey, sharedKey);
}
