/** Argon2id parameters for key derivation */
export const KDF_PARAMS = {
  iterations: 3,
  memory: 65536, // 64 MB
  parallelism: 4,
  keyLength: 32, // 256 bits
} as const;

/** AES-256-GCM constants */
export const AES = {
  ivLength: 12, // 96 bits
  tagLength: 16, // 128 bits
  algorithm: 'aes-256-gcm' as const,
} as const;

/** Key sizes in bytes */
export const KEY_SIZE = {
  master: 32, // 256 bits
  vault: 32, // 256 bits
  salt: 32, // 256 bits
  recovery: 32, // 256 bits
} as const;
