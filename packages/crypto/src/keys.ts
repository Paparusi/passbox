import { argon2id } from '@noble/hashes/argon2';
import type { KeyDerivationParams } from '@passbox/types';
import { KDF_PARAMS, KEY_SIZE } from './constants.js';
import { randomBytes, toBase64, fromBase64 } from './utils.js';

/**
 * Derive a master key from a password using Argon2id.
 *
 * Argon2id is the recommended password hashing algorithm,
 * resistant to both side-channel and GPU attacks.
 */
export function deriveMasterKey(
  password: string,
  salt: Uint8Array,
  params: KeyDerivationParams = KDF_PARAMS,
): Uint8Array {
  return argon2id(new TextEncoder().encode(password), salt, {
    t: params.iterations,
    m: params.memory,
    p: params.parallelism,
    dkLen: KEY_SIZE.master,
  });
}

/** Generate a random salt for key derivation */
export function generateSalt(): Uint8Array {
  return randomBytes(KEY_SIZE.salt);
}

/** Generate a random vault key (256-bit) */
export function generateVaultKey(): Uint8Array {
  return randomBytes(KEY_SIZE.vault);
}

/** Generate a random recovery key (256-bit) */
export function generateRecoveryKey(): Uint8Array {
  return randomBytes(KEY_SIZE.recovery);
}

/** Get default KDF params */
export function getDefaultKdfParams(): KeyDerivationParams {
  return { ...KDF_PARAMS };
}

/**
 * Convert recovery key to human-readable hex groups.
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function recoveryKeyToString(key: Uint8Array): string {
  const hex = toBase64(key);
  return hex;
}

/** Parse recovery key from string */
export function recoveryKeyFromString(str: string): Uint8Array {
  return fromBase64(str.replace(/-/g, ''));
}
