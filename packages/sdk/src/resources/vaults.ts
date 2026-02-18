import type { HttpClient } from '../client.js';
import {
  createVaultKey,
  encryptBytes,
  deriveMasterKey,
  toBase64,
  fromBase64,
} from '@passbox/crypto';

export interface VaultData {
  id: string;
  name: string;
  description?: string;
  role?: string;
  encryptedVaultKey?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateVaultOptions {
  name: string;
  description?: string;
  orgId?: string;
}

export class VaultsResource {
  constructor(
    private client: HttpClient,
    private getMasterKey: () => Uint8Array | null,
  ) {}

  async create(options: CreateVaultOptions): Promise<VaultData> {
    const masterKey = this.getMasterKey();
    if (!masterKey) throw new Error('Not authenticated with master key');

    const { vaultKey, encryptedVaultKey } = createVaultKey(masterKey);

    return this.client.post<VaultData>('/vaults', {
      name: options.name,
      description: options.description,
      encryptedKey: JSON.stringify(encryptedVaultKey),
      encryptedVaultKey: JSON.stringify(encryptedVaultKey),
      orgId: options.orgId,
    });
  }

  async list(): Promise<VaultData[]> {
    return this.client.get<VaultData[]>('/vaults');
  }

  async get(id: string): Promise<VaultData> {
    return this.client.get<VaultData>(`/vaults/${id}`);
  }

  async update(id: string, data: { name?: string; description?: string }): Promise<VaultData> {
    return this.client.put<VaultData>(`/vaults/${id}`, data);
  }

  async delete(id: string): Promise<void> {
    await this.client.delete(`/vaults/${id}`);
  }
}
