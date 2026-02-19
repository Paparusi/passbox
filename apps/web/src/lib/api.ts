import { API_URL } from './utils';

class ApiClient {
  private baseUrl: string;
  private refreshing: Promise<boolean> | null = null;

  constructor() {
    this.baseUrl = `${API_URL}/api/v1`;
  }

  private getToken(): string | null {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem('passbox_token');
  }

  // Try to refresh the access token. Deduplicates concurrent calls.
  private async tryRefresh(): Promise<boolean> {
    if (this.refreshing) return this.refreshing;

    this.refreshing = (async () => {
      try {
        const refreshToken = sessionStorage.getItem('passbox_refresh_token');
        if (!refreshToken) return false;

        const res = await fetch(`${this.baseUrl}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        const data = await res.json();
        if (data.success && data.data) {
          sessionStorage.setItem('passbox_token', data.data.accessToken);
          sessionStorage.setItem('passbox_refresh_token', data.data.refreshToken);
          return true;
        }
        return false;
      } catch {
        return false;
      } finally {
        this.refreshing = null;
      }
    })();

    return this.refreshing;
  }

  private async doFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = this.getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return fetch(`${this.baseUrl}${path}`, { ...options, headers });
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    let res = await this.doFetch(path, options);

    // On 401, try refreshing the token once and retry
    if (res.status === 401) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        res = await this.doFetch(path, options);
      }
    }

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
  // Billing
  async getPlan() {
    return this.request<{
      plan: string;
      limits: { maxVaults: number; maxSecretsPerVault: number; maxMembersPerVault: number; auditRetentionDays: number; maxServiceTokens: number };
      usage: { vaults: number; serviceTokens: number };
      subscription: any;
    }>('/billing/plan');
  }

  async createCheckout(plan: string) {
    return this.request<{ url: string }>('/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    });
  }

  async createPortalSession() {
    return this.request<{ url: string }>('/billing/portal', {
      method: 'POST',
    });
  }

  // OAuth: Get user encryption keys (with explicit token)
  async getKeys(token: string) {
    const res = await fetch(`${this.baseUrl}/auth/keys`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    if (res.status === 404) return null;
    const data = await res.json();
    if (!data.success) return null;
    return data.data as {
      publicKey: string;
      encryptedPrivateKey: string;
      encryptedMasterKeyRecovery: string;
      keyDerivationSalt: string;
      keyDerivationParams: { iterations: number; memory: number; parallelism: number };
    };
  }

  // OAuth: Setup encryption keys for new OAuth users
  async setupKeys(token: string, keys: {
    publicKey: string;
    encryptedPrivateKey: string;
    encryptedMasterKeyRecovery: string;
    keyDerivationSalt: string;
    keyDerivationParams: { iterations: number; memory: number; parallelism: number };
  }) {
    const res = await fetch(`${this.baseUrl}/auth/setup-keys`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(keys),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Failed to setup keys');
    return data.data as { orgId: string };
  }

  // Change password (protected)
  async changePassword(params: {
    newPassword: string;
    encryptedPrivateKey: string;
    encryptedMasterKeyRecovery: string;
    keyDerivationSalt: string;
    keyDerivationParams: { iterations: number; memory: number; parallelism: number };
  }) {
    return this.request<{ message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Delete account (protected)
  async deleteAccount() {
    return this.request<{ message: string }>('/auth/account', {
      method: 'DELETE',
    });
  }

  // Recovery (public, no auth needed)
  async getRecoveryInfo(email: string) {
    const res = await fetch(`${this.baseUrl}/auth/recovery-info`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Recovery info failed');
    return data.data as {
      encryptedMasterKeyRecovery: string;
      encryptedPrivateKey: string;
      publicKey: string;
    };
  }

  async recoverAccount(params: {
    email: string;
    newPassword: string;
    encryptedPrivateKey: string;
    encryptedMasterKeyRecovery: string;
    keyDerivationSalt: string;
    keyDerivationParams: { iterations: number; memory: number; parallelism: number };
  }) {
    const res = await fetch(`${this.baseUrl}/auth/recover`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Recovery failed');
    return data.data;
  }

  // Waitlist (public, no auth needed)
  async joinWaitlist(email: string) {
    const res = await fetch(`${this.baseUrl}/waitlist`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, source: 'website' }),
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Failed to join');
    return data.data;
  }

  async getWaitlistCount() {
    const res = await fetch(`${this.baseUrl}/waitlist/count`);
    const data = await res.json();
    return data.data?.count || 0;
  }

  // Admin
  async adminCheck() {
    return this.request<{ isAdmin: boolean }>('/admin/check');
  }

  async adminGetStats() {
    return this.request<{
      totalUsers: number;
      totalVaults: number;
      totalSecrets: number;
      totalOrgs: number;
      waitlistCount: number;
      totalServiceTokens: number;
      totalAuditLogs: number;
      totalVaultMembers: number;
      totalSecretVersions: number;
      recentSignups: number;
      subscriptions: Record<string, number>;
    }>('/admin/stats');
  }

  async adminGetRevenue() {
    return this.request<{
      configured: boolean;
      balance: { available: number; pending: number; currency: string };
      mrr: number;
      totalRevenue: number;
      activeSubscriptions?: number;
      recentCharges: Array<{
        id: string;
        amount: number;
        currency: string;
        status: string;
        description: string;
        customerEmail: string;
        created: string;
      }>;
    }>('/admin/revenue');
  }

  async adminGetActivity(params?: { limit?: number }) {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return this.request<Array<{
      id: string;
      action: string;
      resourceType: string;
      resourceId: string;
      userId: string;
      userEmail: string | null;
      metadata: any;
      createdAt: string;
    }>>(`/admin/activity${qs ? '?' + qs : ''}`);
  }

  async adminGetUsers(params?: { page?: number; perPage?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.perPage) query.set('perPage', String(params.perPage));
    const qs = query.toString();
    return this.request<{
      users: Array<{
        id: string;
        email: string;
        provider: string;
        emailVerified: boolean;
        plan: string;
        planStatus: string;
        vaultCount: number;
        secretCount: number;
        tokenCount: number;
        createdAt: string;
        lastSignIn: string | null;
      }>;
      page: number;
      perPage: number;
      hasMore: boolean;
    }>(`/admin/users${qs ? '?' + qs : ''}`);
  }

  async adminDeleteUser(userId: string) {
    return this.request<{ deleted: string }>(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }

  async adminChangeUserPlan(userId: string, plan: string) {
    return this.request<{ userId: string; plan: string }>(`/admin/users/${userId}/plan`, {
      method: 'PUT',
      body: JSON.stringify({ plan }),
    });
  }

  async adminGetWaitlist(params?: { page?: number; pageSize?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.pageSize) query.set('pageSize', String(params.pageSize));
    const qs = query.toString();
    return this.request<{
      items: Array<{ id: string; email: string; source: string; created_at: string }>;
      total: number;
      page: number;
      pageSize: number;
      hasMore: boolean;
    }>(`/admin/waitlist${qs ? '?' + qs : ''}`);
  }

  async adminDeleteWaitlistEntry(id: string) {
    return this.request<{ deleted: string }>(`/admin/waitlist/${id}`, {
      method: 'DELETE',
    });
  }
}

export const api = new ApiClient();
