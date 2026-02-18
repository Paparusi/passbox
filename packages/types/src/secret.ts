export interface EncryptedBlob {
  /** Base64-encoded initialization vector (96-bit) */
  iv: string;
  /** Base64-encoded ciphertext */
  ciphertext: string;
  /** Base64-encoded authentication tag */
  tag: string;
  /** Encryption algorithm identifier */
  algorithm: 'aes-256-gcm';
}

export interface Secret {
  id: string;
  vaultId: string;
  name: string;
  encryptedValue: EncryptedBlob;
  description?: string;
  tags: string[];
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SecretVersion {
  id: string;
  secretId: string;
  version: number;
  encryptedValue: EncryptedBlob;
  createdBy: string;
  createdAt: string;
}

export interface SecretEntry {
  name: string;
  value: string;
}
