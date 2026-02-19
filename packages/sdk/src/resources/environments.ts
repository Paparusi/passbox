import type { HttpClient } from '../client.js';

export interface EnvironmentData {
  id: string;
  vault_id: string;
  name: string;
  description?: string;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateEnvironmentOptions {
  vault?: string;
  description?: string;
}

export interface CloneEnvironmentOptions {
  vault?: string;
}

export class EnvironmentsResource {
  constructor(
    private client: HttpClient,
    private resolveVaultId: (nameOrId?: string) => Promise<string>,
  ) {}

  /**
   * List environments in a vault.
   */
  async list(options?: { vault?: string }): Promise<EnvironmentData[]> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.get<EnvironmentData[]>(`/vaults/${vaultId}/environments`);
  }

  /**
   * Create a new environment.
   */
  async create(name: string, options?: CreateEnvironmentOptions): Promise<EnvironmentData> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.post<EnvironmentData>(`/vaults/${vaultId}/environments`, {
      name,
      description: options?.description,
    });
  }

  /**
   * Update an environment.
   */
  async update(envId: string, data: { name?: string; description?: string }, options?: { vault?: string }): Promise<EnvironmentData> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.put<EnvironmentData>(`/vaults/${vaultId}/environments/${envId}`, data);
  }

  /**
   * Delete an environment (cannot delete the default).
   */
  async delete(envId: string, options?: { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.delete(`/vaults/${vaultId}/environments/${envId}`);
  }

  /**
   * Clone secrets from one environment into another.
   */
  async clone(targetEnvId: string, fromEnvId: string, options?: CloneEnvironmentOptions): Promise<{ created: number }> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.post<{ created: number }>(
      `/vaults/${vaultId}/environments/${targetEnvId}/clone`,
      { fromEnvironmentId: fromEnvId },
    );
  }

  /**
   * Resolve an environment name to its ID within a vault.
   */
  async resolve(name: string, options?: { vault?: string }): Promise<string> {
    const envs = await this.list(options);
    const env = envs.find(e => e.name === name);
    if (!env) throw new Error(`Environment "${name}" not found`);
    return env.id;
  }
}
