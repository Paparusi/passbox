// Key derivation
export {
  deriveMasterKey,
  generateSalt,
  generateVaultKey,
  generateRecoveryKey,
  getDefaultKdfParams,
} from './keys.js';

// Symmetric encryption (AES-256-GCM)
export {
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes,
} from './symmetric.js';

// Asymmetric key exchange (X25519)
export {
  generateKeyPair,
  deriveSharedKey,
  serializePublicKey,
  deserializePublicKey,
} from './asymmetric.js';
export type { KeyPair } from './asymmetric.js';

// Vault key management
export {
  createVaultKey,
  decryptVaultKey,
  encryptSecret,
  decryptSecret,
  wrapVaultKeyForSharing,
  unwrapSharedVaultKey,
} from './vault-keys.js';

// Recovery
export {
  createRecoveryKey,
  recoverMasterKey,
} from './recovery.js';

// Utilities
export {
  toBase64,
  fromBase64,
  toBytes,
  fromBytes,
  randomBytes,
} from './utils.js';

// Constants
export { KDF_PARAMS, AES, KEY_SIZE } from './constants.js';
