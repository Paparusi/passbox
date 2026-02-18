import { describe, it, expect } from 'vitest';
import {
  deriveMasterKey,
  generateSalt,
  generateKeyPair,
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes,
  createVaultKey,
  decryptVaultKey,
  encryptSecret,
  decryptSecret,
  wrapVaultKeyForSharing,
  unwrapSharedVaultKey,
  createRecoveryKey,
  recoverMasterKey,
  toBase64,
  fromBase64,
  randomBytes,
} from '../index.js';

describe('Key Derivation', () => {
  it('should derive consistent master key from same password + salt', () => {
    const salt = generateSalt();
    const key1 = deriveMasterKey('test-password', salt);
    const key2 = deriveMasterKey('test-password', salt);
    expect(toBase64(key1)).toBe(toBase64(key2));
  });

  it('should derive different keys from different passwords', () => {
    const salt = generateSalt();
    const key1 = deriveMasterKey('password-1', salt);
    const key2 = deriveMasterKey('password-2', salt);
    expect(toBase64(key1)).not.toBe(toBase64(key2));
  });

  it('should derive different keys from different salts', () => {
    const salt1 = generateSalt();
    const salt2 = generateSalt();
    const key1 = deriveMasterKey('same-password', salt1);
    const key2 = deriveMasterKey('same-password', salt2);
    expect(toBase64(key1)).not.toBe(toBase64(key2));
  });

  it('should produce 32-byte (256-bit) keys', () => {
    const salt = generateSalt();
    const key = deriveMasterKey('test', salt);
    expect(key.length).toBe(32);
  });
});

describe('Symmetric Encryption (AES-256-GCM)', () => {
  const key = randomBytes(32);

  it('should encrypt and decrypt text correctly', () => {
    const plaintext = 'my-super-secret-api-key-12345';
    const blob = encrypt(plaintext, key);
    const decrypted = decrypt(blob, key);
    expect(decrypted).toBe(plaintext);
  });

  it('should produce different ciphertexts for same plaintext (random IV)', () => {
    const plaintext = 'same-secret';
    const blob1 = encrypt(plaintext, key);
    const blob2 = encrypt(plaintext, key);
    expect(blob1.iv).not.toBe(blob2.iv);
    expect(blob1.ciphertext).not.toBe(blob2.ciphertext);
  });

  it('should fail to decrypt with wrong key', () => {
    const plaintext = 'secret';
    const blob = encrypt(plaintext, key);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(blob, wrongKey)).toThrow();
  });

  it('should detect tampered ciphertext', () => {
    const blob = encrypt('secret', key);
    const tampered = { ...blob, ciphertext: toBase64(randomBytes(20)) };
    expect(() => decrypt(tampered, key)).toThrow();
  });

  it('should handle empty string', () => {
    const blob = encrypt('', key);
    expect(decrypt(blob, key)).toBe('');
  });

  it('should handle unicode', () => {
    const plaintext = 'Mật khẩu siêu bí mật 🔐🔑';
    const blob = encrypt(plaintext, key);
    expect(decrypt(blob, key)).toBe(plaintext);
  });

  it('should handle long strings', () => {
    const plaintext = 'x'.repeat(100000);
    const blob = encrypt(plaintext, key);
    expect(decrypt(blob, key)).toBe(plaintext);
  });

  it('should encrypt and decrypt raw bytes', () => {
    const data = randomBytes(64);
    const blob = encryptBytes(data, key);
    const decrypted = decryptBytes(blob, key);
    expect(toBase64(decrypted)).toBe(toBase64(data));
  });
});

describe('Vault Key Management', () => {
  it('should create and decrypt vault key', () => {
    const salt = generateSalt();
    const masterKey = deriveMasterKey('master-password', salt);

    const { vaultKey, encryptedVaultKey } = createVaultKey(masterKey);
    const decryptedVaultKey = decryptVaultKey(encryptedVaultKey, masterKey);

    expect(toBase64(decryptedVaultKey)).toBe(toBase64(vaultKey));
  });

  it('should encrypt and decrypt secrets with vault key', () => {
    const vaultKey = randomBytes(32);
    const secret = 'postgres://user:pass@host:5432/db';

    const blob = encryptSecret(secret, vaultKey);
    const decrypted = decryptSecret(blob, vaultKey);

    expect(decrypted).toBe(secret);
  });

  it('full flow: password → master key → vault key → secret', () => {
    // Setup
    const salt = generateSalt();
    const masterKey = deriveMasterKey('my-master-password', salt);

    // Create vault
    const { vaultKey, encryptedVaultKey } = createVaultKey(masterKey);

    // Store secret
    const secretValue = 'sk_live_abc123def456';
    const encryptedSecret = encryptSecret(secretValue, vaultKey);

    // Later: retrieve and decrypt
    const recoveredVaultKey = decryptVaultKey(encryptedVaultKey, masterKey);
    const recoveredSecret = decryptSecret(encryptedSecret, recoveredVaultKey);

    expect(recoveredSecret).toBe(secretValue);
  });
});

describe('Key Sharing (X25519)', () => {
  it('should share vault key between two users', () => {
    // Alice creates a vault
    const aliceSalt = generateSalt();
    const aliceMasterKey = deriveMasterKey('alice-password', aliceSalt);
    const aliceKeyPair = generateKeyPair();
    const { vaultKey } = createVaultKey(aliceMasterKey);

    // Bob has his own key pair
    const bobKeyPair = generateKeyPair();

    // Alice wraps vault key for Bob
    const wrappedForBob = wrapVaultKeyForSharing(
      vaultKey,
      aliceKeyPair.privateKey,
      bobKeyPair.publicKey,
    );

    // Bob unwraps vault key
    const bobVaultKey = unwrapSharedVaultKey(
      wrappedForBob,
      bobKeyPair.privateKey,
      aliceKeyPair.publicKey,
    );

    expect(toBase64(bobVaultKey)).toBe(toBase64(vaultKey));
  });

  it('should fail if wrong keys are used', () => {
    const aliceKeyPair = generateKeyPair();
    const bobKeyPair = generateKeyPair();
    const eveKeyPair = generateKeyPair();
    const vaultKey = randomBytes(32);

    const wrapped = wrapVaultKeyForSharing(
      vaultKey,
      aliceKeyPair.privateKey,
      bobKeyPair.publicKey,
    );

    // Eve tries to unwrap — should fail
    expect(() =>
      unwrapSharedVaultKey(wrapped, eveKeyPair.privateKey, aliceKeyPair.publicKey),
    ).toThrow();
  });
});

describe('Recovery Key', () => {
  it('should recover master key using recovery key', () => {
    const salt = generateSalt();
    const masterKey = deriveMasterKey('my-password', salt);

    const { recoveryKey, encryptedMasterKey } = createRecoveryKey(masterKey);
    const recoveredMasterKey = recoverMasterKey(recoveryKey, encryptedMasterKey);

    expect(toBase64(recoveredMasterKey)).toBe(toBase64(masterKey));
  });

  it('full recovery flow: recover master → decrypt vault → decrypt secret', () => {
    // Setup
    const salt = generateSalt();
    const masterKey = deriveMasterKey('original-password', salt);
    const { recoveryKey, encryptedMasterKey } = createRecoveryKey(masterKey);
    const { vaultKey, encryptedVaultKey } = createVaultKey(masterKey);
    const encryptedSecret = encryptSecret('my-api-key', vaultKey);

    // User forgets password, uses recovery key
    const recoveredMasterKey = recoverMasterKey(recoveryKey, encryptedMasterKey);
    const recoveredVaultKey = decryptVaultKey(encryptedVaultKey, recoveredMasterKey);
    const recoveredSecret = decryptSecret(encryptedSecret, recoveredVaultKey);

    expect(recoveredSecret).toBe('my-api-key');
  });
});

describe('Base64 Utils', () => {
  it('should roundtrip base64 encoding', () => {
    const original = randomBytes(64);
    const encoded = toBase64(original);
    const decoded = fromBase64(encoded);
    expect(toBase64(decoded)).toBe(toBase64(original));
  });
});
