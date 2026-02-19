import type { HttpClient } from '../client.js';

export interface ChangePasswordOptions {
  newPassword: string;
  encryptedPrivateKey: string;
  encryptedMasterKeyRecovery: string;
  keyDerivationSalt: string;
  keyDerivationParams: {
    iterations: number;
    memory: number;
    parallelism: number;
  };
}

export class AccountResource {
  constructor(private client: HttpClient) {}

  /** Change master password (re-encrypts private key with new password) */
  async changePassword(data: ChangePasswordOptions): Promise<void> {
    await this.client.post('/auth/change-password', data);
  }

  /** Permanently delete account and all associated data */
  async deleteAccount(): Promise<void> {
    await this.client.delete('/auth/account');
  }
}
