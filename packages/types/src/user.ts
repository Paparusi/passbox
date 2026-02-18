export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  createdAt: string;
}

export interface UserKeys {
  id: string;
  userId: string;
  /** X25519 public key (base64) */
  publicKey: string;
  /** Private key encrypted with master key (base64 EncryptedBlob JSON) */
  encryptedPrivateKey: string;
  /** Master key encrypted with recovery key (base64 EncryptedBlob JSON) */
  encryptedMasterKeyRecovery?: string;
  /** Argon2id salt (base64) */
  keyDerivationSalt: string;
  /** Argon2id parameters */
  keyDerivationParams: KeyDerivationParams;
  createdAt: string;
  updatedAt: string;
}

export interface KeyDerivationParams {
  iterations: number;
  memory: number;
  parallelism: number;
}
