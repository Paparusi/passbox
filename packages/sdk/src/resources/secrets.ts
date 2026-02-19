import type { HttpClient } from '../client.js';
import type { EncryptedBlob } from '@pabox/types';
import {
  decryptVaultKey,
  encryptSecret,
  decryptSecret,
} from '@pabox/crypto';

export interface SecretData {
  id: string;
  name: string;
  encrypted_value: string;
  environment_id?: string;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export interface GetSecretOptions {
  vault?: string;
  env?: string;
}

export interface SecretVersionData {
  id: string;
  secret_id: string;
  version: number;
  encrypted_value: string;
  created_by: string;
  created_at: string;
}

export interface SetSecretOptions {
  vault?: string;
  env?: string;
  description?: string;
  tags?: string[];
}

export class SecretsResource {
  constructor(
    private client: HttpClient,
    private getMasterKey: () => Uint8Array | null,
    private resolveVaultId: (nameOrId?: string) => Promise<string>,
    private getVaultKey: (vaultId: string) => Promise<Uint8Array>,
    private resolveEnvId?: (name: string, options?: { vault?: string }) => Promise<string>,
  ) {}

  /**
   * Get a secret's decrypted value.
   */
  async get(name: string, options?: GetSecretOptions): Promise<string> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const vaultKey = await this.getVaultKey(vaultId);

    const envQuery = options?.env ? await this.buildEnvQuery(options.env, options.vault) : '';
    const secret = await this.client.get<SecretData>(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}${envQuery}`,
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

    const environmentId = options?.env ? await this.getEnvId(options.env, options.vault) : undefined;

    try {
      // Try create first
      await this.client.post(`/vaults/${vaultId}/secrets`, {
        name,
        encryptedValue,
        description: options?.description,
        tags: options?.tags,
        environmentId,
      });
    } catch (err: any) {
      if (err.code === 'CONFLICT') {
        // Secret exists, update it
        const envQuery = environmentId ? `?environmentId=${environmentId}` : '';
        await this.client.put(
          `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}${envQuery}`,
          { encryptedValue, description: options?.description, tags: options?.tags, environmentId },
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
    const envQuery = options?.env ? await this.buildEnvQuery(options.env, options.vault) : '';
    await this.client.delete(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}${envQuery}`,
    );
  }

  /**
   * List all secrets in a vault (names only, not decrypted).
   */
  async list(options?: GetSecretOptions): Promise<SecretData[]> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const envQuery = options?.env ? await this.buildEnvQuery(options.env, options.vault) : '';
    return this.client.get<SecretData[]>(`/vaults/${vaultId}/secrets${envQuery}`);
  }

  /**
   * Get all secrets decrypted as key-value pairs.
   */
  async getAll(options?: GetSecretOptions): Promise<Record<string, string>> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const vaultKey = await this.getVaultKey(vaultId);
    const envQuery = options?.env ? await this.buildEnvQuery(options.env, options.vault) : '';
    const secrets = await this.client.get<SecretData[]>(`/vaults/${vaultId}/secrets${envQuery}`);

    const result: Record<string, string> = {};
    for (const secret of secrets) {
      const blob: EncryptedBlob = JSON.parse(secret.encrypted_value);
      result[secret.name] = decryptSecret(blob, vaultKey);
    }
    return result;
  }

  /**
   * Get version history for a secret (encrypted values).
   */
  async versions(name: string, options?: GetSecretOptions): Promise<SecretVersionData[]> {
    const vaultId = await this.resolveVaultId(options?.vault);
    const envQuery = options?.env ? await this.buildEnvQuery(options.env, options.vault) : '';
    return this.client.get<SecretVersionData[]>(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(name)}/versions${envQuery}`,
    );
  }

  private async getEnvId(envName: string, vault?: string): Promise<string> {
    if (!this.resolveEnvId) throw new Error('Environment resolution not available');
    return this.resolveEnvId(envName, { vault });
  }

  private async buildEnvQuery(envName: string, vault?: string): Promise<string> {
    const envId = await this.getEnvId(envName, vault);
    return `?environmentId=${envId}`;
  }
}
