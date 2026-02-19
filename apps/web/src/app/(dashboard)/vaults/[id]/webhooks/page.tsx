'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';

interface Webhook {
  id: string;
  vault_id: string;
  name: string;
  url: string;
  events: string[];
  signing_secret: string;
  active: boolean;
  created_at: string;
  last_triggered_at: string | null;
}

interface Vault {
  id: string;
  name: string;
  role?: string;
}

const ALL_EVENTS = [
  { value: 'secret.created', label: 'Secret Created' },
  { value: 'secret.updated', label: 'Secret Updated' },
  { value: 'secret.deleted', label: 'Secret Deleted' },
  { value: 'secret.rotated', label: 'Secret Rotated' },
];

export default function WebhooksPage() {
  const params = useParams();
  const router = useRouter();
  const vaultId = params.id as string;
  const { toast } = useToast();
  const { confirm } = useConfirm();

  const [vault, setVault] = useState<Vault | null>(null);
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Signing secret reveal
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);

  const isAdmin = vault?.role === 'owner' || vault?.role === 'admin';

  async function loadData() {
    try {
      const [vaultData, webhooksData] = await Promise.all([
        api.getVault(vaultId),
        api.getWebhooks(vaultId),
      ]);
      setVault(vaultData);
      setWebhooks(webhooksData || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load webhooks', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [vaultId]);

  function openCreate() {
    setEditingWebhook(null);
    setFormName('');
    setFormUrl('');
    setFormEvents(new Set(['secret.created', 'secret.updated', 'secret.deleted']));
    setShowModal(true);
  }

  function openEdit(webhook: Webhook) {
    setEditingWebhook(webhook);
    setFormName(webhook.name);
    setFormUrl(webhook.url);
    setFormEvents(new Set(webhook.events));
    setShowModal(true);
  }

  function toggleEvent(event: string) {
    setFormEvents(prev => {
      const next = new Set(prev);
      if (next.has(event)) next.delete(event);
      else next.add(event);
      return next;
    });
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (formEvents.size === 0) {
      toast('Select at least one event', 'error');
      return;
    }
    setSaving(true);

    try {
      if (editingWebhook) {
        await api.updateWebhook(vaultId, editingWebhook.id, {
          name: formName,
          url: formUrl,
          events: Array.from(formEvents),
        });
        toast('Webhook updated', 'success');
      } else {
        await api.createWebhook(vaultId, formName, formUrl, Array.from(formEvents));
        toast('Webhook created', 'success');
      }
      setShowModal(false);
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to save webhook', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(webhook: Webhook) {
    const ok = await confirm({
      title: 'Delete Webhook',
      message: `Delete webhook "${webhook.name}"? This cannot be undone.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;

    try {
      await api.deleteWebhook(vaultId, webhook.id);
      toast('Webhook deleted', 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to delete', 'error');
    }
  }

  async function handleToggleActive(webhook: Webhook) {
    try {
      await api.updateWebhook(vaultId, webhook.id, { active: !webhook.active });
      toast(webhook.active ? 'Webhook paused' : 'Webhook activated', 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to update', 'error');
    }
  }

  async function handleTest(webhook: Webhook) {
    try {
      await api.testWebhook(vaultId, webhook.id);
      toast('Test event sent', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to send test', 'error');
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
            <button onClick={() => router.push('/vaults')} className="hover:text-foreground transition-colors">
              Vaults
            </button>
            <span>/</span>
            <button onClick={() => router.push(`/vaults/${vaultId}`)} className="hover:text-foreground transition-colors">
              {vault?.name || 'Vault'}
            </button>
            <span>/</span>
            <span className="text-foreground">Webhooks</span>
          </div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Get notified when secrets change in this vault
          </p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate}>+ Add Webhook</Button>
        )}
      </div>

      {/* Webhook list */}
      {webhooks.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <div className="text-4xl mb-4">&#x1F514;</div>
          <h3 className="text-lg font-semibold mb-2">No webhooks configured</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Add a webhook to get notified when secrets are created, updated, or deleted
          </p>
          {isAdmin && <Button onClick={openCreate}>Add Webhook</Button>}
        </div>
      ) : (
        <div className="space-y-3">
          {webhooks.map((webhook) => (
            <div
              key={webhook.id}
              className="border border-border rounded-xl bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">{webhook.name}</h3>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        webhook.active
                          ? 'bg-green-500/10 text-green-500'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {webhook.active ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                    {webhook.url}
                  </p>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleTest(webhook)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Test
                    </button>
                    <button
                      onClick={() => openEdit(webhook)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(webhook)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {webhook.active ? 'Pause' : 'Enable'}
                    </button>
                    <button
                      onClick={() => handleDelete(webhook)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {webhook.events.map((event) => (
                  <span
                    key={event}
                    className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground"
                  >
                    {event}
                  </span>
                ))}
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>
                  Created {new Date(webhook.created_at).toLocaleDateString()}
                </span>
                {webhook.last_triggered_at && (
                  <span>
                    Last triggered {new Date(webhook.last_triggered_at).toLocaleDateString()}
                  </span>
                )}
                <button
                  onClick={() =>
                    setRevealedSecret(
                      revealedSecret === webhook.id ? null : webhook.id
                    )
                  }
                  className="hover:text-foreground transition-colors"
                >
                  {revealedSecret === webhook.id ? 'Hide secret' : 'Show signing secret'}
                </button>
              </div>

              {revealedSecret === webhook.id && (
                <div className="bg-muted rounded-lg p-2">
                  <code className="text-xs font-mono text-foreground break-all">
                    {webhook.signing_secret}
                  </code>
                  <button
                    onClick={async () => {
                      await navigator.clipboard.writeText(webhook.signing_secret);
                      toast('Copied signing secret', 'success');
                    }}
                    className="ml-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Copy
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editingWebhook ? 'Edit Webhook' : 'Add Webhook'}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            id="webhook-name"
            label="Name"
            placeholder="e.g. Deploy Notification"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            required
          />
          <Input
            id="webhook-url"
            label="Endpoint URL"
            type="url"
            placeholder="https://example.com/webhook"
            value={formUrl}
            onChange={(e) => setFormUrl(e.target.value)}
            required
          />
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-muted-foreground">
              Events
            </label>
            <div className="space-y-2">
              {ALL_EVENTS.map((event) => (
                <label
                  key={event.value}
                  className="flex items-center gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={formEvents.has(event.value)}
                    onChange={() => toggleEvent(event.value)}
                    className="rounded border-border"
                  />
                  <span>{event.label}</span>
                  <span className="text-xs text-muted-foreground font-mono">
                    {event.value}
                  </span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setShowModal(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving || formEvents.size === 0}>
              {saving
                ? 'Saving...'
                : editingWebhook
                  ? 'Update Webhook'
                  : 'Create Webhook'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
