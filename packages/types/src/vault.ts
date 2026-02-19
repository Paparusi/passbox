export interface Vault {
  id: string;
  orgId: string;
  name: string;
  description?: string;
  /** Vault symmetric key encrypted with owner's master key (base64) */
  encryptedKey: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  vaultId: string;
  name: string;
  description?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export type VaultRole = 'owner' | 'admin' | 'member' | 'viewer';

export interface VaultMember {
  id: string;
  vaultId: string;
  userId: string;
  /** Vault key encrypted with this user's public key (base64) */
  encryptedVaultKey: string;
  role: VaultRole;
  grantedBy: string;
  createdAt: string;
}
