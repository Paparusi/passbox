import type { EncryptedBlob } from '@passbox/types';
import {
  deriveMasterKey,
  generateSalt,
  generateKeyPair,
  encryptBytes,
  decryptBytes,
  decryptVaultKey,
  createRecoveryKey,
  serializePublicKey,
  toBase64,
  fromBase64,
  getDefaultKdfParams,
} from '@passbox/crypto';
import { HttpClient, type ClientConfig } from './client.js';
import { VaultsResource } from './resources/vaults.js';
import { SecretsResource } from './resources/secrets.js';
import { EnvResource } from './resources/env.js';

export interface PassBoxConfig {
  /** Server URL (default: https://api.passbox.dev) */
  serverUrl?: string;
  /** Service token (pb_...) for machine-to-machine auth */
  token?: string;
}

export interface LoginOptions {
  serverUrl?: string;
  email: string;
  password: string;
}

export interface RegisterOptions {
  serverUrl?: string;
  email: string;
  password: string;
}

export class PassBox {
  private client: HttpClient;
  private masterKey: Uint8Array | null = null;
  private vaultKeyCache = new Map<string, Uint8Array>();
  private defaultVaultId: string | null = null;

  public vaults: VaultsResource;
  public secrets: SecretsResource;
  public env: EnvResource;

  constructor(config: PassBoxConfig) {
    this.client = new HttpClient({
      serverUrl: config.serverUrl || 'https://api.passbox.dev',
      token: config.token,
    });

    this.vaults = new VaultsResource(this.client, () => this.masterKey);
    this.secrets = new SecretsResource(
      this.client,
      () => this.masterKey,
      (nameOrId) => this.resolveVaultId(nameOrId),
      (vaultId) => this.getVaultKey(vaultId),
    );
    this.env = new EnvResource(this.secrets);
  }

  /**
   * Register a new account. Returns the recovery key (show to user ONCE).
   */
  static async register(options: RegisterOptions): Promise<{ passbox: PassBox; recoveryKey: string }> {
    const serverUrl = options.serverUrl || 'https://api.passbox.dev';
    const client = new HttpClient({ serverUrl });

    // Generate key material
    const salt = generateSalt();
    const kdfParams = getDefaultKdfParams();
    const masterKey = deriveMasterKey(options.password, salt, kdfParams);
    const keyPair = generateKeyPair();

    // Encrypt private key with master key
    const encryptedPrivateKey = encryptBytes(keyPair.privateKey, masterKey);

    // Create recovery key
    const { recoveryKey, encryptedMasterKey } = createRecoveryKey(masterKey);

    // Register on server
    const data = await client.publicPost<{
      user: { id: string; email: string };
      session: { accessToken: string; refreshToken: string; expiresAt: string } | null;
      orgId: string;
    }>('/auth/register', {
      email: options.email,
      password: options.password,
      publicKey: serializePublicKey(keyPair.publicKey),
      encryptedPrivateKey: JSON.stringify(encryptedPrivateKey),
      encryptedMasterKeyRecovery: JSON.stringify(encryptedMasterKey),
      keyDerivationSalt: toBase64(salt),
      keyDerivationParams: kdfParams,
    });

    const pb = new PassBox({ serverUrl });
    pb.masterKey = masterKey;
    if (data.session) {
      pb.client.setAccessToken(data.session.accessToken);
    }

    return { passbox: pb, recoveryKey };
  }

  /**
   * Login with email + password. Derives master key client-side.
   */
  static async login(options: LoginOptions): Promise<PassBox> {
    const serverUrl = options.serverUrl || 'https://api.passbox.dev';
    const client = new HttpClient({ serverUrl });

    const data = await client.publicPost<{
      user: { id: string; email: string };
      session: { accessToken: string; refreshToken: string; expiresAt: string };
      keys: {
        publicKey: string;
        encryptedPrivateKey: string;
        keyDerivationSalt: string;
        keyDerivationParams: { iterations: number; memory: number; parallelism: number };
      } | null;
    }>('/auth/login', {
      email: options.email,
      password: options.password,
    });

    const pb = new PassBox({ serverUrl });
    pb.client.setAccessToken(data.session.accessToken);

    // Derive master key from password
    if (data.keys) {
      const salt = fromBase64(data.keys.keyDerivationSalt);
      pb.masterKey = deriveMasterKey(options.password, salt, data.keys.keyDerivationParams);
    }

    return pb;
  }

  /**
   * Set the default vault to use when vault is not specified.
   */
  setDefaultVault(vaultId: string) {
    this.defaultVaultId = vaultId;
  }

  /**
   * Resolve vault name or ID to a vault ID.
   */
  private async resolveVaultId(nameOrId?: string): Promise<string> {
    if (nameOrId) {
      // Check if it's a UUID
      if (nameOrId.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
        return nameOrId;
      }
      // Otherwise treat as name
      const vaultList = await this.vaults.list();
      const vault = vaultList.find(v => v.name === nameOrId);
      if (!vault) throw new Error(`Vault "${nameOrId}" not found`);
      return vault.id;
    }

    if (this.defaultVaultId) return this.defaultVaultId;

    // Auto-select first vault
    const vaultList = await this.vaults.list();
    if (vaultList.length === 0) {
      throw new Error('No vaults found. Create one first with pb.vaults.create()');
    }
    this.defaultVaultId = vaultList[0].id;
    return this.defaultVaultId;
  }

  /**
   * Get decrypted vault key (with caching).
   */
  private async getVaultKey(vaultId: string): Promise<Uint8Array> {
    const cached = this.vaultKeyCache.get(vaultId);
    if (cached) return cached;

    if (!this.masterKey) {
      throw new Error('Master key not available. Login with password or set service token.');
    }

    const vault = await this.vaults.get(vaultId);
    if (!vault.encryptedVaultKey) {
      throw new Error('No vault key available');
    }

    const encryptedVaultKey: EncryptedBlob = JSON.parse(vault.encryptedVaultKey);
    const vaultKey = decryptVaultKey(encryptedVaultKey, this.masterKey);
    this.vaultKeyCache.set(vaultId, vaultKey);
    return vaultKey;
  }
}

// Re-export types
export type { VaultData, CreateVaultOptions } from './resources/vaults.js';
export type { SecretData, GetSecretOptions, SetSecretOptions } from './resources/secrets.js';
export type { EnvImportOptions } from './resources/env.js';
