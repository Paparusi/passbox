export interface ServiceToken {
  id: string;
  name: string;
  /** SHA-256 hash of the token */
  tokenHash: string;
  /** First 8 chars for identification (pb_...) */
  tokenPrefix: string;
  userId: string;
  orgId: string;
  /** Scoped to specific vaults (empty = all vaults) */
  vaultIds: string[];
  permissions: TokenPermission[];
  /** Master key encrypted for this token */
  encryptedMasterKey: string;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
}

export type TokenPermission = 'read' | 'write' | 'list' | 'delete';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: {
    id: string;
    email: string;
  };
}

export interface AuthCredentials {
  email: string;
  password: string;
}

export interface ServiceTokenCreateRequest {
  name: string;
  vaultIds?: string[];
  permissions: TokenPermission[];
  expiresAt?: string;
}

export interface ServiceTokenCreateResponse {
  /** The raw token — only shown once */
  token: string;
  serviceToken: ServiceToken;
}
