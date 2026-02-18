import type { EncryptedBlob } from './secret.js';
import type { VaultRole } from './vault.js';

// ─── Generic API Response ────────────────────────────
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

// ─── Auth ────────────────────────────────────────────
export interface RegisterRequest {
  email: string;
  password: string;
  /** Base64 X25519 public key */
  publicKey: string;
  /** Private key encrypted with master key */
  encryptedPrivateKey: string;
  /** Master key encrypted with recovery key */
  encryptedMasterKeyRecovery: string;
  keyDerivationSalt: string;
  keyDerivationParams: {
    iterations: number;
    memory: number;
    parallelism: number;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
}

// ─── Vaults ──────────────────────────────────────────
export interface CreateVaultRequest {
  name: string;
  description?: string;
  /** Vault key encrypted with user's master key */
  encryptedKey: string;
  /** Vault key encrypted with user's public key (for sharing) */
  encryptedVaultKey: string;
  orgId?: string;
}

export interface UpdateVaultRequest {
  name?: string;
  description?: string;
}

// ─── Secrets ─────────────────────────────────────────
export interface CreateSecretRequest {
  name: string;
  encryptedValue: EncryptedBlob;
  description?: string;
  tags?: string[];
}

export interface UpdateSecretRequest {
  encryptedValue: EncryptedBlob;
  description?: string;
  tags?: string[];
}

export interface BulkCreateSecretRequest {
  secrets: CreateSecretRequest[];
}

// ─── Sharing ─────────────────────────────────────────
export interface ShareVaultRequest {
  email: string;
  role: VaultRole;
  /** Vault key encrypted with target user's public key */
  encryptedVaultKey: string;
}

export interface UpdateMemberRoleRequest {
  role: VaultRole;
}

// ─── Audit ───────────────────────────────────────────
export interface AuditLogEntry {
  id: string;
  orgId: string;
  userId?: string;
  tokenId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AuditQueryParams {
  page?: number;
  pageSize?: number;
  action?: string;
  resourceType?: string;
  startDate?: string;
  endDate?: string;
}
