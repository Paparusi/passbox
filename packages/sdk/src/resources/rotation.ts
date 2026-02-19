import type { HttpClient } from '../client.js';

export interface RotationConfigData {
  id: string;
  secret_id: string;
  interval_hours: number;
  last_rotated_at: string | null;
  next_rotation_at: string | null;
  webhook_id: string | null;
  enabled: boolean;
  created_at: string;
}

export interface SetRotationOptions {
  intervalHours: number;
  webhookId?: string | null;
  enabled?: boolean;
}

export class RotationResource {
  constructor(
    private client: HttpClient,
    private resolveVaultId: (nameOrId?: string) => Promise<string>,
  ) {}

  /** Get rotation config for a secret */
  async get(secretName: string, options?: { vault?: string }): Promise<RotationConfigData | null> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.get<RotationConfigData | null>(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(secretName)}/rotation`,
    );
  }

  /** Set or update rotation config */
  async set(secretName: string, config: SetRotationOptions & { vault?: string }): Promise<RotationConfigData> {
    const vaultId = await this.resolveVaultId(config.vault);
    return this.client.put<RotationConfigData>(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(secretName)}/rotation`,
      {
        intervalHours: config.intervalHours,
        webhookId: config.webhookId,
        enabled: config.enabled,
      },
    );
  }

  /** Remove rotation config from a secret */
  async remove(secretName: string, options?: { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.delete(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(secretName)}/rotation`,
    );
  }

  /** Manually trigger a rotation event */
  async trigger(secretName: string, options?: { vault?: string }): Promise<{ rotatedAt: string }> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.post<{ rotatedAt: string }>(
      `/vaults/${vaultId}/secrets/${encodeURIComponent(secretName)}/rotate`,
    );
  }
}
