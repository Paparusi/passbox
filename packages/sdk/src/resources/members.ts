import type { HttpClient } from '../client.js';

export interface MemberData {
  id: string;
  user_id: string;
  role: string;
  email: string;
  created_at: string;
}

export interface AddMemberOptions {
  email: string;
  role: 'admin' | 'member' | 'viewer';
  encryptedVaultKey: string;
}

export class MembersResource {
  constructor(
    private client: HttpClient,
    private resolveVaultId: (nameOrId?: string) => Promise<string>,
  ) {}

  /** List all members of a vault */
  async list(options?: { vault?: string }): Promise<MemberData[]> {
    const vaultId = await this.resolveVaultId(options?.vault);
    return this.client.get<MemberData[]>(`/vaults/${vaultId}/members`);
  }

  /** Add a member to a vault (requires encrypted vault key from X25519 key exchange) */
  async add(data: AddMemberOptions & { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(data.vault);
    await this.client.post(`/vaults/${vaultId}/members`, {
      email: data.email,
      role: data.role,
      encryptedVaultKey: data.encryptedVaultKey,
    });
  }

  /** Update a member's role */
  async updateRole(memberId: string, role: string, options?: { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.put(`/vaults/${vaultId}/members/${memberId}`, { role });
  }

  /** Remove a member from a vault */
  async remove(memberId: string, options?: { vault?: string }): Promise<void> {
    const vaultId = await this.resolveVaultId(options?.vault);
    await this.client.delete(`/vaults/${vaultId}/members/${memberId}`);
  }

  /** Get a user's public encryption key by email */
  async getUserPublicKey(email: string): Promise<string> {
    const data = await this.client.get<{ publicKey: string }>(
      `/vaults/user-key/${encodeURIComponent(email)}`,
    );
    return data.publicKey;
  }
}
