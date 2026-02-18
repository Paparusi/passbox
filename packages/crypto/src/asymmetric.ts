import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';
import { randomBytes, toBase64, fromBase64 } from './utils.js';
import { KEY_SIZE } from './constants.js';

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

/**
 * Generate an X25519 key pair for asymmetric key exchange.
 * Used for sharing vault keys between users.
 */
export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/**
 * Compute a shared secret using X25519 Diffie-Hellman.
 * Then derive an AES-256 key from the shared secret using HKDF-SHA256.
 *
 * @param myPrivateKey - Our X25519 private key
 * @param theirPublicKey - Their X25519 public key
 * @returns A 256-bit symmetric key for AES-256-GCM
 */
export function deriveSharedKey(
  myPrivateKey: Uint8Array,
  theirPublicKey: Uint8Array,
): Uint8Array {
  const sharedSecret = x25519.getSharedSecret(myPrivateKey, theirPublicKey);

  // Derive a proper encryption key from the shared secret
  return hkdf(sha256, sharedSecret, undefined, 'passbox-vault-share', KEY_SIZE.vault);
}

/** Serialize a public key to base64 */
export function serializePublicKey(key: Uint8Array): string {
  return toBase64(key);
}

/** Deserialize a public key from base64 */
export function deserializePublicKey(base64: string): Uint8Array {
  return fromBase64(base64);
}
