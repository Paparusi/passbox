import { API_URL } from './utils';

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_URL}/api/v1`;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('passbox_token');
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers,
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error?.message || 'Request failed');
    }
    return data.data;
  }

  // Auth
  async register(email: string, password: string, keys: {
    publicKey: string;
    encryptedPrivateKey: string;
    encryptedMasterKeyRecovery: string;
    keyDerivationSalt: string;
    keyDerivationParams: { iterations: number; memory: number; parallelism: number };
  }) {
    return this.request<any>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, ...keys }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{
      user: { id: string; email: string };
      session: { accessToken: string; refreshToken: string; expiresAt: string };
      keys: {
        publicKey: string;
        encryptedPrivateKey: string;
        keyDerivationSalt: string;
        keyDerivationParams: { iterations: number; memory: number; parallelism: number };
      } | null;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  // Vaults
  async getVaults() {
    return this.request<any[]>('/vaults');
  }

  async createVault(name: string, description: string, encryptedKey: string, encryptedVaultKey: string) {
    return this.request<any>('/vaults', {
      method: 'POST',
      body: JSON.stringify({ name, description, encryptedKey, encryptedVaultKey }),
    });
  }

  async getVault(id: string) {
    return this.request<any>(`/vaults/${id}`);
  }

  async deleteVault(id: string) {
    return this.request<any>(`/vaults/${id}`, { method: 'DELETE' });
  }

  // Secrets
  async getSecrets(vaultId: string) {
    return this.request<any[]>(`/vaults/${vaultId}/secrets`);
  }

  async getSecret(vaultId: string, name: string) {
    return this.request<any>(`/vaults/${vaultId}/secrets/${name}`);
  }

  async createSecret(vaultId: string, name: string, encryptedValue: any, description?: string, tags?: string[]) {
    return this.request<any>(`/vaults/${vaultId}/secrets`, {
      method: 'POST',
      body: JSON.stringify({ name, encryptedValue, description, tags }),
    });
  }

  async updateSecret(vaultId: string, name: string, encryptedValue: any) {
    return this.request<any>(`/vaults/${vaultId}/secrets/${name}`, {
      method: 'PUT',
      body: JSON.stringify({ encryptedValue }),
    });
  }

  async deleteSecret(vaultId: string, name: string) {
    return this.request<any>(`/vaults/${vaultId}/secrets/${name}`, { method: 'DELETE' });
  }

  async getSecretVersions(vaultId: string, name: string) {
    return this.request<any[]>(`/vaults/${vaultId}/secrets/${encodeURIComponent(name)}/versions`);
  }

  // Sharing
  async getVaultMembers(vaultId: string) {
    return this.request<any[]>(`/vaults/${vaultId}/members`);
  }

  async addVaultMember(vaultId: string, email: string, role: string, encryptedVaultKey: string) {
    return this.request<any>(`/vaults/${vaultId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role, encryptedVaultKey }),
    });
  }

  async updateVaultMember(vaultId: string, memberId: string, role: string) {
    return this.request<any>(`/vaults/${vaultId}/members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify({ role }),
    });
  }

  async removeVaultMember(vaultId: string, memberId: string) {
    return this.request<any>(`/vaults/${vaultId}/members/${memberId}`, { method: 'DELETE' });
  }

  async getUserPublicKey(email: string) {
    return this.request<{ publicKey: string }>(`/vaults/user-key/${encodeURIComponent(email)}`);
  }

  // Audit
  async getAuditLogs(params?: { page?: number; pageSize?: number; action?: string; resourceType?: string; startDate?: string; endDate?: string }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    if (params?.action) query.set('action', params.action);
    if (params?.resourceType) query.set('resourceType', params.resourceType);
    if (params?.startDate) query.set('startDate', params.startDate);
    if (params?.endDate) query.set('endDate', params.endDate);
    const qs = query.toString();
    return this.request<{ items: any[]; total: number; page: number; pageSize: number; hasMore: boolean }>(`/audit${qs ? '?' + qs : ''}`);
  }
}

export const api = new ApiClient();
