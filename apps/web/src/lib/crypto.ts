/**
 * Client-side E2E encryption for the web dashboard.
 * Uses the same @noble/* libraries as @pabox/crypto.
 * Self-contained — no workspace dependencies.
 */

import { argon2id } from '@noble/hashes/argon2.js';
import { gcm } from '@noble/ciphers/aes.js';
import { x25519 } from '@noble/curves/ed25519.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';

// ─── Types ──────────────────────────────────────────

export interface EncryptedBlob {
  iv: string;
  ciphertext: string;
  tag: string;
  algorithm: string;
}

export interface KeyDerivationParams {
  iterations: number;
  memory: number;
  parallelism: number;
}

export interface KeyPair {
  publicKey: Uint8Array;
  privateKey: Uint8Array;
}

// ─── Constants ──────────────────────────────────────

const KDF_PARAMS: KeyDerivationParams = {
  iterations: 3,
  memory: 65536, // 64 MB
  parallelism: 4,
};

const AES_IV_LENGTH = 12;
const AES_TAG_LENGTH = 16;
const KEY_SIZE = 32; // 256 bits

// ─── Base64 Utilities ───────────────────────────────

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

// ─── Key Derivation ─────────────────────────────────

export function getDefaultKdfParams(): KeyDerivationParams {
  return { ...KDF_PARAMS };
}

export function generateSalt(): Uint8Array {
  return randomBytes(KEY_SIZE);
}

/**
 * Derive master key from password using Argon2id.
 * WARNING: This is CPU-intensive (~2-5 seconds). Run in a loading state.
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
    dkLen: KEY_SIZE,
  });
}

// ─── Asymmetric Keys (X25519) ───────────────────────

export function generateKeyPair(): KeyPair {
  const privateKey = randomBytes(32);
  const publicKey = x25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

export function serializePublicKey(key: Uint8Array): string {
  return toBase64(key);
}

// ─── Symmetric Encryption (AES-256-GCM) ────────────

function encryptRaw(data: Uint8Array, key: Uint8Array): EncryptedBlob {
  const iv = randomBytes(AES_IV_LENGTH);
  const aes = gcm(key, iv);
  const sealed = aes.encrypt(data);
  const ciphertext = sealed.slice(0, sealed.length - AES_TAG_LENGTH);
  const tag = sealed.slice(sealed.length - AES_TAG_LENGTH);
  return {
    iv: toBase64(iv),
    ciphertext: toBase64(ciphertext),
    tag: toBase64(tag),
    algorithm: 'aes-256-gcm',
  };
}

function decryptRaw(blob: EncryptedBlob, key: Uint8Array): Uint8Array {
  const iv = fromBase64(blob.iv);
  const ciphertext = fromBase64(blob.ciphertext);
  const tag = fromBase64(blob.tag);
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext);
  sealed.set(tag, ciphertext.length);
  const aes = gcm(key, iv);
  return aes.decrypt(sealed);
}

/** Encrypt a string value with AES-256-GCM */
export function encryptSecret(value: string, vaultKey: Uint8Array): EncryptedBlob {
  return encryptRaw(new TextEncoder().encode(value), vaultKey);
}

/** Decrypt an EncryptedBlob back to a string */
export function decryptSecret(blob: EncryptedBlob, vaultKey: Uint8Array): string {
  return new TextDecoder().decode(decryptRaw(blob, vaultKey));
}

/** Encrypt raw bytes (for keys) */
export function encryptBytes(data: Uint8Array, key: Uint8Array): EncryptedBlob {
  return encryptRaw(data, key);
}

/** Decrypt raw bytes (for keys) */
export function decryptBytes(blob: EncryptedBlob, key: Uint8Array): Uint8Array {
  return decryptRaw(blob, key);
}

// ─── Vault Key Management ───────────────────────────

/** Create a new vault key, encrypted with the master key */
export function createVaultKey(masterKey: Uint8Array): {
  vaultKey: Uint8Array;
  encryptedVaultKey: EncryptedBlob;
} {
  const vaultKey = randomBytes(KEY_SIZE);
  const encryptedVaultKey = encryptBytes(vaultKey, masterKey);
  return { vaultKey, encryptedVaultKey };
}

/** Decrypt a vault key using the master key */
export function decryptVaultKey(encryptedVaultKey: EncryptedBlob, masterKey: Uint8Array): Uint8Array {
  return decryptBytes(encryptedVaultKey, masterKey);
}

// ─── Recovery Key ───────────────────────────────────

/** Create a recovery key and encrypt the master key with it */
export function createRecoveryKey(masterKey: Uint8Array): {
  recoveryKey: string;
  encryptedMasterKey: EncryptedBlob;
} {
  const recoveryKeyBytes = randomBytes(KEY_SIZE);
  const encryptedMasterKey = encryptBytes(masterKey, recoveryKeyBytes);
  const recoveryKey = toBase64(recoveryKeyBytes);
  return { recoveryKey, encryptedMasterKey };
}

/** Decrypt a master key using the recovery key */
export function decryptMasterKeyWithRecovery(
  encryptedMasterKey: EncryptedBlob,
  recoveryKey: string,
): Uint8Array {
  const recoveryKeyBytes = fromBase64(recoveryKey);
  return decryptBytes(encryptedMasterKey, recoveryKeyBytes);
}
