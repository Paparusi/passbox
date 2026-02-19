import type { HttpClient } from '../client.js';

export interface ServiceTokenData {
  id: string;
  name: string;
  token_prefix: string;
  vault_ids: string[];
  permissions: string[];
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface CreateTokenOptions {
  name: string;
  permissions: ('read' | 'write' | 'list' | 'delete')[];
  vaultIds?: string[];
  expiresAt?: string;
  encryptedMasterKey: string;
}

export interface CreateTokenResult {
  token: string;
  serviceToken: ServiceTokenData;
}

export class TokensResource {
  constructor(private client: HttpClient) {}

  /** List all service tokens for the current user */
  async list(): Promise<ServiceTokenData[]> {
    return this.client.get<ServiceTokenData[]>('/auth/service-tokens');
  }

  /** Create a new service token (returns the raw token only once) */
  async create(data: CreateTokenOptions): Promise<CreateTokenResult> {
    return this.client.post<CreateTokenResult>('/auth/service-token', {
      name: data.name,
      permissions: data.permissions,
      vaultIds: data.vaultIds,
      expiresAt: data.expiresAt,
      encryptedMasterKey: data.encryptedMasterKey,
    });
  }

  /** Revoke (delete) a service token by ID */
  async revoke(tokenId: string): Promise<void> {
    await this.client.delete(`/auth/service-token/${tokenId}`);
  }
}
