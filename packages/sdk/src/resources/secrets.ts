import type { HttpClient } from '../client.js';
import type { EncryptedBlob } from '@passbox/types';
import {
  decryptVaultKey,
  encryptSecret,
  decryptSecret,
} from '@passbox/crypto';

export interface SecretData {
  id: string;
  name: string;
  encrypted_value: string;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GetSecretOptions {
  vault?: string;
}

export interface SetSecretOptions {
  vault?: string;
  description?: string;
  tags?: string[];
}

export class SecretsResource {
  constructor(
    private client: HttpClient,
    private getMasterKey: () => Uint8Array | null,
    private resolveVaultId: (nameOrId?: string) => Promise<string>,
    private getVaultKey: (vaultId: string) => Promise<Uint8Array>,
  ) {}

  /**
   * Get a secret's decrypted value.
   */
  async get(name: string, options?: GetSecretOptions): Promise<string> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const vaultKey = await this.getVaultKey(vaultId);

    const secret = await this.client.get<SecretData>(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}`,
    );

    const blob: EncryptedBlob = JSON.parse(secret.encrypted_value);
    return decryptSecret(blob, vaultKey);
  }

  /**
   * Set (create or update) a secret.
   */
  async set(name: string, value: string, options?: SetSecretOptions): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const vaultKey = await this.getVaultKey(vaultId);
    const encryptedValue = encryptSecret(value, vaultKey);

    try {
      // Try create first
      await this.client.post(`/vaults/${vaultId}/secrets`, {
        name,
        encryptedValue,
        description: options?.description,
        tags: options?.tags,
      });
    } catch (err: any) {
      if (err.code === 'CONFLICT') {
        // Secret exists, update it
        await this.client.put(
          `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}`,
          { encryptedValue, description: options?.description, tags: options?.tags },
        );
      } else {
        throw err;
      }
    }
  }

  /**
   * Delete a secret.
   */
  async delete(name: string, options?: GetSecretOptions): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.delete(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}`,
    );
  }

  /**
   * List all secrets in a vault (names only, not decrypted).
   */
  async list(options?: GetSecretOptions): Promise<SecretData[]> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.get<SecretData[]>(`/vaults/${vaultId}/secrets`);
  }

  /**
   * Get all secrets decrypted as key-value pairs.
   */
  async getAll(options?: GetSecretOptions): Promise<Record<string, string>> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const vaultKey = await this.getVaultKey(vaultId);
    const secrets = await this.client.get<SecretData[]>(`/vaults/${vaultId}/secrets`);

    const result: Record<string, string> = {};
    for (const secret of secrets) {
      const blob: EncryptedBlob = JSON.parse(secret.encrypted_value);
      result[secret.name] = decryptSecret(blob, vaultKey);
    }
    return result;
  }
}
