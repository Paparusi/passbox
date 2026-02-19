import type { HttpClient } from '../client.js';

export interface WebhookData {
  id: string;
  vault_id: string;
  name: string;
  url: string;
  events: string[];
  signing_secret: string;
  active: boolean;
  created_by: string;
  created_at: string;
  last_triggered_at: string | null;
}

export interface CreateWebhookOptions {
  name: string;
  url: string;
  events: string[];
}

export interface UpdateWebhookOptions {
  name?: string;
  url?: string;
  events?: string[];
  active?: boolean;
}

export class WebhooksResource {
  constructor(
    private client: HttpClient,
    private resolveVaultId: (nameOrId?: string) => Promise<string>,
  ) {}

  /** List all webhooks in a vault */
  async list(options?: { vault?: string }): Promise<WebhookData[]> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.get<WebhookData[]>(`/vaults/${vaultId}/webhooks`);
  }

  /** Create a webhook */
  async create(data: CreateWebhookOptions & { vault?: string }): Promise<WebhookData> {
    const vaultId = await this.resolveVaultId(data.vault);
    return this.client.post<WebhookData>(`/vaults/${vaultId}/webhooks`, {
      name: data.name,
      url: data.url,
      events: data.events,
    });
  }

  /** Update a webhook */
  async update(webhookId: string, data: UpdateWebhookOptions & { vault?: string }): Promise<WebhookData> {
    const vaultId = await this.resolveVaultId(data.vault);
    return this.client.put<WebhookData>(`/vaults/${vaultId}/webhooks/${webhookId}`, {
      name: data.name,
      url: data.url,
      events: data.events,
      active: data.active,
    });
  }

  /** Delete a webhook */
  async delete(webhookId: string, options?: { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.delete(`/vaults/${vaultId}/webhooks/${webhookId}`);
  }

  /** Send a test event to a webhook */
  async test(webhookId: string, options?: { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.post(`/vaults/${vaultId}/webhooks/${webhookId}/test`);
  }
}
