'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { createVaultKey } from '@/lib/crypto';

interface Vault {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  secret_count?: number;
}

export default function VaultsPage() {
  const [vaults, setVaults] = useState<Vault[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { masterKey } = useAuth();

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadVaults() {
    try {
      const data = await api.getVaults();
      setVaults(data || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load vaults', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadVaults();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);

    try {
      if (!masterKey) {
        toast('Please log in again to create vaults', 'error');
        return;
      }

      const { encryptedVaultKey } = createVaultKey(masterKey);
      // encryptedKey: stored on the vault record (vault-level key)
      // encryptedVaultKey: stored on the vault_member record (owner's copy)
      // Both encrypted with the owner's master key at creation time.
      // When sharing, the vault key is re-encrypted with the target user's public key.
      const encryptedKeyStr = JSON.stringify(encryptedVaultKey);

      await api.createVault(
        newName,
        newDesc,
        encryptedKeyStr,
        encryptedKeyStr
      );

      setShowCreate(false);
      setNewName('');
      setNewDesc('');
      toast('Vault created successfully', 'success');
      await loadVaults();
    } catch (err: any) {
      toast(err.message || 'Failed to create vault', 'error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    const ok = await confirm({
      title: 'Delete Vault',
      message: `Are you sure you want to delete "${name}"? All secrets inside will be permanently lost.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    setDeleting(id);
    try {
      await api.deleteVault(id);
      setVaults(vaults.filter(v => v.id !== id));
      toast('Vault deleted', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to delete vault', 'error');
    } finally {
      setDeleting(null);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vaults</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Organize your secrets into encrypted vaults
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ New Vault</Button>
      </div>

      {vaults.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <div className="text-4xl mb-4">&#x1f510;</div>
          <h3 className="text-lg font-semibold mb-2">No vaults yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Create your first vault to start storing secrets
          </p>
          <Button onClick={() => setShowCreate(true)}>Create Vault</Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {vaults.map((vault) => (
            <div
              key={vault.id}
              className="group relative rounded-xl border border-border bg-card p-5 hover:border-primary/50 transition-colors"
            >
              <Link href={`/vaults/${vault.id}`} className="absolute inset-0 z-10" />
              <div className="flex items-start justify-between">
                <div className="space-y-1">
                  <h3 className="font-semibold">{vault.name}</h3>
                  {vault.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {vault.description}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    handleDelete(vault.id, vault.name);
                  }}
                  disabled={deleting === vault.id}
                  className="relative z-20 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 text-sm"
                >
                  {deleting === vault.id ? '...' : 'Delete'}
                </button>
              </div>
              <div className="mt-4 text-xs text-muted-foreground">
                Created {new Date(vault.created_at).toLocaleDateString()}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Vault">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            id="vault-name"
            label="Vault Name"
            placeholder="e.g. myapp-production"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <Input
            id="vault-desc"
            label="Description (optional)"
            placeholder="Production secrets for my app"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="ghost" onClick={() => setShowCreate(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating...' : 'Create Vault'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
