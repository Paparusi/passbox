'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { api } from '@/lib/api';

interface Secret {
  id: string;
  name: string;
  encrypted_value: string;
  description: string | null;
  tags: string[];
  version: number;
  created_at: string;
  updated_at: string;
}

export default function VaultDetailPage() {
  const params = useParams();
  const router = useRouter();
  const vaultId = params.id as string;

  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Create modal
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit modal
  const [editSecret, setEditSecret] = useState<Secret | null>(null);
  const [editValue, setEditValue] = useState('');

  // Reveal state
  const [revealed, setRevealed] = useState<Set<string>>(new Set());

  // Delete state
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadSecrets() {
    try {
      const data = await api.getSecrets(vaultId);
      setSecrets(data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load secrets');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSecrets();
  }, [vaultId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      // Placeholder encrypted value (real E2E encryption will wrap this)
      const encryptedValue = JSON.stringify({
        ciphertext: btoa(newValue),
        iv: crypto.getRandomValues(new Uint8Array(12)).toString(),
        tag: 'placeholder',
        algorithm: 'aes-256-gcm',
      });

      await api.createSecret(vaultId, newName, encryptedValue, newDesc || undefined);
      setShowCreate(false);
      setNewName('');
      setNewValue('');
      setNewDesc('');
      await loadSecrets();
    } catch (err: any) {
      setError(err.message || 'Failed to create secret');
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(e: React.FormEvent) {
    e.preventDefault();
    if (!editSecret) return;
    setSaving(true);

    try {
      const encryptedValue = JSON.stringify({
        ciphertext: btoa(editValue),
        iv: crypto.getRandomValues(new Uint8Array(12)).toString(),
        tag: 'placeholder',
        algorithm: 'aes-256-gcm',
      });

      await api.updateSecret(vaultId, editSecret.name, encryptedValue);
      setEditSecret(null);
      setEditValue('');
      await loadSecrets();
    } catch (err: any) {
      setError(err.message || 'Failed to update secret');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete secret "${name}"? This cannot be undone.`)) return;
    setDeleting(name);
    try {
      await api.deleteSecret(vaultId, name);
      setSecrets(secrets.filter(s => s.name !== name));
    } catch (err: any) {
      setError(err.message || 'Failed to delete secret');
    } finally {
      setDeleting(null);
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

  function decodeValue(encrypted: string): string {
    try {
      const parsed = JSON.parse(encrypted);
      return atob(parsed.ciphertext);
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/vaults')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            &larr; Vaults
          </button>
          <span className="text-muted-foreground">/</span>
          <h1 className="text-2xl font-bold">Secrets</h1>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ Add Secret</Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {secrets.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <div className="text-4xl mb-4">🔑</div>
          <h3 className="text-lg font-semibold mb-2">No secrets yet</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Add your first secret to this vault
          </p>
          <Button onClick={() => setShowCreate(true)}>Add Secret</Button>
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
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
              {secrets.map((secret) => (
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
                      >
                        {revealed.has(secret.name) ? 'Hide' : 'Show'}
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
    </div>
  );
}
