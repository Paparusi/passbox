import { gcm } from '@noble/ciphers/aes';
import type { EncryptedBlob } from '@pabox/types';
import { AES } from './constants.js';
import { randomBytes, toBase64, fromBase64, toBytes, fromBytes } from './utils.js';

/**
 * Encrypt plaintext using AES-256-GCM.
 *
 * - Generates a random 96-bit IV for each encryption
 * - Returns an EncryptedBlob with iv, ciphertext, and tag (all base64)
 * - The tag is appended to ciphertext by @noble/ciphers, we split it out
 */
export function encrypt(plaintext: string, key: Uint8Array): EncryptedBlob {
  const iv = randomBytes(AES.ivLength);
  const aes = gcm(key, iv);
  const plaintextBytes = toBytes(plaintext);
  const sealed = aes.encrypt(plaintextBytes);

  // @noble/ciphers appends the 16-byte auth tag to ciphertext
  const ciphertext = sealed.slice(0, sealed.length - AES.tagLength);
  const tag = sealed.slice(sealed.length - AES.tagLength);

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    tag: toBase64(tag),
    algorithm: AES.algorithm,
  };
}

/**
 * Decrypt an EncryptedBlob using AES-256-GCM.
 *
 * - Reconstructs the sealed message (ciphertext + tag)
 * - Returns the plaintext string
 * - Throws if authentication fails (tampered data)
 */
export function decrypt(blob: EncryptedBlob, key: Uint8Array): string {
  const iv = fromBase64(blob.iv);
  const ciphertext = fromBase64(blob.ciphertext);
  const tag = fromBase64(blob.tag);

  // Reconstruct the sealed message (ciphertext + tag)
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);

  const aes = gcm(key, iv);
  const plaintext = aes.decrypt(sealed);

  return fromBytes(plaintext);
}

/**
 * Encrypt raw bytes with AES-256-GCM.
 * Used for encrypting keys (vault key, private key).
 */
export function encryptBytes(data: Uint8Array, key: Uint8Array): EncryptedBlob {
  const iv = randomBytes(AES.ivLength);
  const aes = gcm(key, iv);
  const sealed = aes.encrypt(data);

  const ciphertext = sealed.slice(0, sealed.length - AES.tagLength);
  const tag = sealed.slice(sealed.length - AES.tagLength);

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    tag: toBase64(tag),
    algorithm: AES.algorithm,
  };
}

/**
 * Decrypt an EncryptedBlob back to raw bytes.
 * Used for decrypting keys (vault key, private key).
 */
export function decryptBytes(blob: EncryptedBlob, key: Uint8Array): Uint8Array {
  const iv = fromBase64(blob.iv);
  const ciphertext = fromBase64(blob.ciphertext);
  const tag = fromBase64(blob.tag);

  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);

  const aes = gcm(key, iv);
  return aes.decrypt(sealed);
}
