'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  decryptVaultKey,
  decryptSharedVaultKey,
  decryptBytes,
  encryptSecret,
  decryptSecret,
  fromBase64,
  type EncryptedBlob,
  type SharedVaultKey,
} from '@/lib/crypto';

interface Vault {
  id: string;
  name: string;
  description: string | null;
  encryptedVaultKey?: string;
}

interface Secret {
  id: string;
  name: string;
  encrypted_value: string;
  environment_id?: string;
  description: string | null;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

interface Environment {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
}

export default function VaultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vaultId = params.id as string;
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { masterKey, requestUnlock } = useAuth();

  const [vault, setVault] = useState<Vault | null>(null);
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [selectedEnvId, setSelectedEnvId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Environment management modal
  const [showEnvModal, setShowEnvModal] = useState(false);
  const [newEnvName, setNewEnvName] = useState('');
  const [creatingEnv, setCreatingEnv] = useState(false);

  // Vault key (decrypted, held in memory)
  const vaultKeyRef = useRef<Uint8Array | null>(null);
  const privateKeyRef = useRef<Uint8Array | null>(null);

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editSecret, setEditSecret] = useState<Secret | null>(null);
  const [editValue, setEditValue] = useState('');

  // Reveal + copy state
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<string | null>(null);

  // Import modal
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importFormat, setImportFormat] = useState<'env' | 'json' | 'csv'>('env');
  const [importing, setImporting] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  // Version history modal
  const [versionSecret, setVersionSecret] = useState<Secret | null>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Ensure we have the user's private key (for shared vault decryption)
  async function ensurePrivateKey(): Promise<Uint8Array | null> {
    if (privateKeyRef.current) return privateKeyRef.current;
    if (!masterKey) return null;
    try {
      const token = sessionStorage.getItem('passbox_token');
      if (!token) return null;
      const keys = await api.getKeys(token);
      if (!keys) return null;
      const encPrivKey: EncryptedBlob = JSON.parse(keys.encryptedPrivateKey);
      const pk = decryptBytes(encPrivKey, masterKey);
      privateKeyRef.current = pk;
      return pk;
    } catch {
      return null;
    }
  }

  function getVaultKey(vaultData: Vault): Uint8Array | null {
    if (vaultKeyRef.current) return vaultKeyRef.current;
    if (!masterKey || !vaultData.encryptedVaultKey) return null;

    try {
      const parsed = JSON.parse(vaultData.encryptedVaultKey);

      if (parsed.type === 'shared') {
        // Shared vault: decrypt using X25519 key exchange
        if (!privateKeyRef.current) return null;
        const vaultKey = decryptSharedVaultKey(parsed as SharedVaultKey, privateKeyRef.current);
        vaultKeyRef.current = vaultKey;
        return vaultKey;
      }

      // Own vault: decrypt directly with master key
      const vaultKey = decryptVaultKey(parsed as EncryptedBlob, masterKey);
      vaultKeyRef.current = vaultKey;
      return vaultKey;
    } catch {
      return null;
    }
  }

  async function loadData(envId?: string | null) {
    try {
      const [vaultData, envsData] = await Promise.all([
        api.getVault(vaultId),
        api.getEnvironments(vaultId),
      ]);
      setVault(vaultData);
      setEnvironments(envsData || []);

      // Select default environment on first load
      const activeEnvId = envId ?? selectedEnvId ?? envsData?.find((e: Environment) => e.is_default)?.id ?? null;
      if (activeEnvId && !selectedEnvId) setSelectedEnvId(activeEnvId);

      const secretsData = await api.getSecrets(vaultId, activeEnvId || undefined);
      setSecrets(secretsData || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load vault', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function loadSecrets(envId: string) {
    try {
      const secretsData = await api.getSecrets(vaultId, envId);
      setSecrets(secretsData || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load secrets', 'error');
    }
  }

  function handleEnvChange(envId: string) {
    setSelectedEnvId(envId);
    setSearch('');
    setRevealed(new Set());
    loadSecrets(envId);
  }

  useEffect(() => {
    vaultKeyRef.current = null;
    privateKeyRef.current = null;
    // Load private key for shared vault support, then load data
    ensurePrivateKey().then(() => loadData());
  }, [vaultId, masterKey]);

  const filteredSecrets = secrets.filter(s =>
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.description?.toLowerCase().includes(search.toLowerCase())
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      let vaultKey = vault ? getVaultKey(vault) : null;
      if (!vaultKey) {
        const mk = await requestUnlock();
        if (!mk || !vault) {
          toast('Unlock vault first to create secrets', 'error');
          setSaving(false);
          return;
        }
        vaultKey = getVaultKey(vault);
        if (!vaultKey) {
          toast('Failed to decrypt vault key', 'error');
          setSaving(false);
          return;
        }
      }

      const encryptedValue = encryptSecret(newValue, vaultKey);
      await api.createSecret(vaultId, newName, encryptedValue, newDesc || undefined, undefined, selectedEnvId || undefined);
      setShowCreate(false);
      setNewName('');
      setNewValue('');
      setNewDesc('');
      toast('Secret created', 'success');
      if (selectedEnvId) await loadSecrets(selectedEnvId); else await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to create secret', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editSecret) return;
    setSaving(true);

    try {
      let vaultKey = vault ? getVaultKey(vault) : null;
      if (!vaultKey) {
        const mk = await requestUnlock();
        if (!mk || !vault) {
          toast('Unlock vault first to update secrets', 'error');
          setSaving(false);
          return;
        }
        vaultKey = getVaultKey(vault);
        if (!vaultKey) {
          toast('Failed to decrypt vault key', 'error');
          setSaving(false);
          return;
        }
      }

      const encryptedValue = encryptSecret(editValue, vaultKey);
      await api.updateSecret(vaultId, editSecret.name, encryptedValue);
      setEditSecret(null);
      setEditValue('');
      toast('Secret updated', 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to update secret', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    const ok = await confirm({
      title: 'Delete Secret',
      message: `Delete secret "${name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeleting(name);
    try {
      await api.deleteSecret(vaultId, name);
      setSecrets(secrets.filter(s => s.name !== name));
      toast('Secret deleted', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to delete secret', 'error');
    } finally {
      setDeleting(null);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!importText.trim()) return;
    setImporting(true);

    try {
      const vaultKey = vault ? getVaultKey(vault) : null;
      if (!vaultKey) {
        toast('Unlock vault first to import secrets', 'error');
        return;
      }

      // Parse the input based on format
      let entries: Record<string, string> = {};

      if (importFormat === 'json') {
        const parsed = JSON.parse(importText);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (item.name && item.value !== undefined) entries[item.name] = String(item.value);
          }
        } else {
          entries = Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, String(v)]));
        }
      } else if (importFormat === 'csv') {
        const lines = importText.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length >= 2) {
          const header = lines[0].toLowerCase().split(',').map(h => h.trim());
          const ni = header.indexOf('name');
          const vi = header.indexOf('value');
          if (ni !== -1 && vi !== -1) {
            for (let i = 1; i < lines.length; i++) {
              const cols = lines[i].split(',');
              if (cols[ni] && cols[vi]) entries[cols[ni].trim()] = cols[vi].trim();
            }
          }
        }
      } else {
        // .env format
        for (const line of importText.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eq = trimmed.indexOf('=');
          if (eq === -1) continue;
          const key = trimmed.slice(0, eq).trim();
          let val = trimmed.slice(eq + 1).trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          entries[key] = val;
        }
      }

      const entryCount = Object.keys(entries).length;
      if (entryCount === 0) {
        toast('No secrets found in input', 'error');
        return;
      }

      let created = 0;
      for (const [name, value] of Object.entries(entries)) {
        try {
          const encryptedValue = encryptSecret(value, vaultKey);
          await api.createSecret(vaultId, name, encryptedValue, undefined, undefined, selectedEnvId || undefined);
          created++;
        } catch {
          // Try update on conflict
          try {
            const encryptedValue = encryptSecret(value, vaultKey);
            await api.updateSecret(vaultId, name, encryptedValue);
            created++;
          } catch { /* skip */ }
        }
      }

      setShowImport(false);
      setImportText('');
      toast(`Imported ${created} secrets`, 'success');
      if (selectedEnvId) await loadSecrets(selectedEnvId); else await loadData();
    } catch (err: any) {
      toast(err.message || 'Import failed', 'error');
    } finally {
      setImporting(false);
    }
  }

  async function loadVersions(secret: Secret) {
    setVersionSecret(secret);
    setLoadingVersions(true);
    try {
      const data = await api.getSecretVersions(vaultId, secret.name);
      setVersions(data || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load versions', 'error');
    } finally {
      setLoadingVersions(false);
    }
  }

  function toggleReveal(name: string) {
    setRevealed(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function copyValue(name: string, encrypted: string) {
    const value = decodeValue(encrypted);
    await navigator.clipboard.writeText(value);
    setCopied(name);
    toast('Copied to clipboard', 'success');
    setTimeout(() => setCopied(null), 2000);
  }

  function decodeValue(encrypted: string): string {
    try {
      const blob: EncryptedBlob = JSON.parse(encrypted);
      const vaultKey = vault ? getVaultKey(vault) : null;

      if (vaultKey && blob.tag !== 'placeholder') {
        return decryptSecret(blob, vaultKey);
      }

      // Fallback for legacy placeholder encryption
      return atob(blob.ciphertext);
    } catch {
      return '***';
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <button
              onClick={() => router.push('/vaults')}
              className="hover:text-foreground transition-colors"
            >
              Vaults
            </button>
            <span>/</span>
            <span className="text-foreground">{vault?.name || 'Vault'}</span>
          </div>
          <h1 className="text-2xl font-bold">{vault?.name || 'Vault'}</h1>
          {vault?.description && (
            <p className="text-sm text-muted-foreground mt-1">{vault.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => router.push(`/vaults/${vaultId}/webhooks`)}>
            Webhooks
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/vaults/${vaultId}/members`)}>
            Members
          </Button>
          <Button variant="ghost" onClick={() => setShowImport(true)}>Import</Button>
          <Button onClick={() => setShowCreate(true)}>+ Add Secret</Button>
        </div>
      </div>

      {/* Crypto status — prompt to unlock */}
      {!masterKey && (
        <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 flex items-center justify-between gap-3">
          <span className="text-sm text-warning">Encryption key expired. Unlock to view and manage secrets.</span>
          <button
            onClick={() => requestUnlock()}
            className="shrink-0 px-3 h-8 text-xs font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Unlock
          </button>
        </div>
      )}

      {/* Environment selector */}
      {environments.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 rounded-lg border border-border bg-muted p-1">
            {environments.map((env) => (
              <button
                key={env.id}
                onClick={() => handleEnvChange(env.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  selectedEnvId === env.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background'
                }`}
              >
                {env.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowEnvModal(true)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
          >
            Manage
          </button>
        </div>
      )}

      {/* Search bar */}
      {secrets.length > 0 && (
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search secrets..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex h-10 w-full max-w-sm rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            />
          </div>
          <span className="text-sm text-muted-foreground">
            {filteredSecrets.length} secret{filteredSecrets.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {secrets.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <div className="text-4xl mb-4">&#x1f511;</div>
          <h3 className="text-lg font-semibold mb-2">No secrets yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Add your first secret to this vault
          </p>
          <Button onClick={() => setShowCreate(true)}>Add Secret</Button>
        </div>
      ) : filteredSecrets.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          No secrets matching &quot;{search}&quot;
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">NAME</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">VALUE</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">VERSION</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">UPDATED</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filteredSecrets.map((secret) => (
                  <tr key={secret.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="font-mono text-sm font-medium">{secret.name}</span>
                      {secret.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{secret.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-sm text-muted-foreground font-mono">
                          {revealed.has(secret.name)
                            ? decodeValue(secret.encrypted_value)
                            : '••••••••'}
                        </code>
                        <button
                          onClick={() => toggleReveal(secret.name)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={revealed.has(secret.name) ? 'Hide value' : 'Show value'}
                        >
                          {revealed.has(secret.name) ? 'Hide' : 'Show'}
                        </button>
                        <button
                          onClick={() => copyValue(secret.name, secret.encrypted_value)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          aria-label="Copy value"
                        >
                          {copied === secret.name ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">v{secret.version}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground">
                        {new Date(secret.updated_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => loadVersions(secret)}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          History
                        </button>
                        <button
                          onClick={() => {
                            setEditSecret(secret);
                            setEditValue(decodeValue(secret.encrypted_value));
                          }}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(secret.name)}
                          disabled={deleting === secret.name}
                          className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                        >
                          {deleting === secret.name ? '...' : 'Delete'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {filteredSecrets.map((secret) => (
              <div key={secret.id} className="border border-border rounded-xl bg-card p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-mono text-sm font-medium">{secret.name}</span>
                    {secret.description && (
                      <p className="text-xs text-muted-foreground mt-0.5">{secret.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground">v{secret.version}</span>
                </div>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-muted-foreground font-mono flex-1 truncate">
                    {revealed.has(secret.name)
                      ? decodeValue(secret.encrypted_value)
                      : '••••••••'}
                  </code>
                </div>
                <div className="flex items-center gap-3 pt-1 border-t border-border">
                  <button
                    onClick={() => toggleReveal(secret.name)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {revealed.has(secret.name) ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={() => copyValue(secret.name, secret.encrypted_value)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied === secret.name ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => loadVersions(secret)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    History
                  </button>
                  <button
                    onClick={() => {
                      setEditSecret(secret);
                      setEditValue(decodeValue(secret.encrypted_value));
                    }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(secret.name)}
                    disabled={deleting === secret.name}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors ml-auto"
                  >
                    {deleting === secret.name ? '...' : 'Delete'}
                  </button>
                  <span className="text-xs text-muted-foreground">
                    {new Date(secret.updated_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Create Secret Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Add Secret">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="secret-name"
            label="Secret Name"
            placeholder="e.g. DATABASE_URL"
            value={newName}
            onChange={(e) => setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))}
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="secret-value" className="block text-sm font-medium text-muted-foreground">
              Value
            </label>
            <textarea
              id="secret-value"
              rows={3}
              placeholder="Secret value..."
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              required
              className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors font-mono resize-none"
            />
          </div>
          <Input
            id="secret-desc"
            label="Description (optional)"
            placeholder="What this secret is for"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Add Secret'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Edit Secret Modal */}
      <Modal
        open={!!editSecret}
        onClose={() => setEditSecret(null)}
        title={editSecret ? `Edit ${editSecret.name}` : 'Edit Secret'}
      >
        <form onSubmit={handleUpdate} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="edit-value" className="block text-sm font-medium text-muted-foreground">
              New Value
            </label>
            <textarea
              id="edit-value"
              rows={3}
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              required
              className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors font-mono resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="ghost" onClick={() => setEditSecret(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Update Secret'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Import Modal */}
      <Modal open={showImport} onClose={() => setShowImport(false)} title="Import Secrets">
        <form onSubmit={handleImport} className="space-y-4">
          <div className="flex gap-2">
            {(['env', 'json', 'csv'] as const).map((fmt) => (
              <button
                key={fmt}
                type="button"
                onClick={() => setImportFormat(fmt)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  importFormat === fmt
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:text-foreground'
                }`}
              >
                .{fmt}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="import-text" className="block text-sm font-medium text-muted-foreground">
              Paste your {importFormat === 'env' ? '.env' : importFormat.toUpperCase()} content
            </label>
            <textarea
              id="import-text"
              rows={8}
              placeholder={
                importFormat === 'env' ? 'DATABASE_URL=postgres://...\nAPI_KEY=sk-...\nSECRET=value' :
                importFormat === 'json' ? '{\n  "DATABASE_URL": "postgres://...",\n  "API_KEY": "sk-..."\n}' :
                'name,value\nDATABASE_URL,postgres://...\nAPI_KEY,sk-...'
              }
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              required
              className="flex w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors font-mono resize-none"
            />
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="ghost" onClick={() => setShowImport(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={importing || !importText.trim()}>
              {importing ? 'Importing...' : 'Import'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Environment Management Modal */}
      <Modal open={showEnvModal} onClose={() => setShowEnvModal(false)} title="Manage Environments">
        <div className="space-y-4">
          <div className="space-y-2">
            {environments.map((env) => (
              <div key={env.id} className="flex items-center justify-between border border-border rounded-lg p-3">
                <div>
                  <span className="text-sm font-medium">{env.name}</span>
                  {env.is_default && (
                    <span className="ml-2 text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">default</span>
                  )}
                  {env.description && (
                    <p className="text-xs text-muted-foreground mt-0.5">{env.description}</p>
                  )}
                </div>
                {!env.is_default && (
                  <button
                    onClick={async () => {
                      const ok = await confirm({
                        title: 'Delete Environment',
                        message: `Delete "${env.name}"? All secrets in this environment will be lost.`,
                        confirmLabel: 'Delete',
                        destructive: true,
                      });
                      if (!ok) return;
                      try {
                        await api.deleteEnvironment(vaultId, env.id);
                        toast(`Environment "${env.name}" deleted`, 'success');
                        if (selectedEnvId === env.id) {
                          const defaultEnv = environments.find(e => e.is_default);
                          if (defaultEnv) handleEnvChange(defaultEnv.id);
                        }
                        await loadData(selectedEnvId);
                      } catch (err: any) {
                        toast(err.message || 'Failed to delete', 'error');
                      }
                    }}
                    className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newEnvName.trim()) return;
              setCreatingEnv(true);
              try {
                await api.createEnvironment(vaultId, newEnvName.toLowerCase().replace(/[^a-z0-9_-]/g, '-'));
                setNewEnvName('');
                toast('Environment created', 'success');
                await loadData(selectedEnvId);
              } catch (err: any) {
                toast(err.message || 'Failed to create', 'error');
              } finally {
                setCreatingEnv(false);
              }
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              placeholder="new-environment"
              value={newEnvName}
              onChange={(e) => setNewEnvName(e.target.value)}
              className="flex-1 h-9 rounded-lg border border-border bg-muted px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <Button type="submit" disabled={creatingEnv || !newEnvName.trim()}>
              {creatingEnv ? '...' : 'Create'}
            </Button>
          </form>
        </div>
      </Modal>

      {/* Version History Modal */}
      <Modal
        open={!!versionSecret}
        onClose={() => { setVersionSecret(null); setVersions([]); }}
        title={versionSecret ? `History: ${versionSecret.name}` : 'Version History'}
      >
        {loadingVersions ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : versions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No version history available</p>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {versions.map((v: any, i: number) => (
              <div key={v.id || i} className="border border-border rounded-lg p-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Version {v.version}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString()}
                  </span>
                </div>
                <code className="text-xs text-muted-foreground font-mono block truncate">
                  {(() => {
                    try {
                      const blob: EncryptedBlob = JSON.parse(v.encrypted_value);
                      const vaultKey = vault ? getVaultKey(vault) : null;
                      if (vaultKey && blob.tag !== 'placeholder') {
                        return decryptSecret(blob, vaultKey);
                      }
                      return atob(blob.ciphertext);
                    } catch {
                      return '(encrypted)';
                    }
                  })()}
                </code>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
