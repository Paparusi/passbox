'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import {
  decryptBytes,
  decryptVaultKey,
  shareVaultKeyForUser,
  fromBase64,
  type EncryptedBlob,
} from '@/lib/crypto';

interface Member {
  id: string;
  user_id: string;
  role: string;
  email: string;
  created_at: string;
}

interface Vault {
  id: string;
  name: string;
  role?: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
  viewer: 'Viewer',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'text-warning',
  admin: 'text-primary',
  member: 'text-foreground',
  viewer: 'text-muted-foreground',
};

export default function VaultMembersPage() {
  const params = useParams();
  const router = useRouter();
  const vaultId = params.id as string;
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const { user, masterKey, requestUnlock } = useAuth();

  const [vault, setVault] = useState<Vault | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Invite modal
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');
  const [inviting, setInviting] = useState(false);

  const isAdmin = vault?.role === 'owner' || vault?.role === 'admin';

  async function loadData() {
    try {
      const [vaultData, membersData] = await Promise.all([
        api.getVault(vaultId),
        api.getVaultMembers(vaultId),
      ]);
      setVault(vaultData);
      setMembers(membersData || []);
    } catch (err: any) {
      toast(err.message || 'Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [vaultId]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviting(true);

    try {
      // Ensure vault is unlocked
      let mk = masterKey;
      if (!mk) {
        mk = await requestUnlock();
        if (!mk) {
          toast('Unlock vault first to invite members', 'error');
          setInviting(false);
          return;
        }
      }

      // 1. Get our keys from server
      const token = sessionStorage.getItem('passbox_token');
      if (!token) throw new Error('Not authenticated');
      const ourKeys = await api.getKeys(token);
      if (!ourKeys) throw new Error('Could not load your encryption keys');

      // 2. Decrypt our private key
      const encPrivKey: EncryptedBlob = JSON.parse(ourKeys.encryptedPrivateKey);
      const ourPrivateKey = decryptBytes(encPrivKey, mk);

      // 3. Get vault data to decrypt vault key
      const vaultData = await api.getVault(vaultId);
      if (!vaultData.encryptedVaultKey) throw new Error('Vault key not available');
      const encVaultKey: EncryptedBlob = JSON.parse(vaultData.encryptedVaultKey);
      const vaultKey = decryptVaultKey(encVaultKey, mk);

      // 4. Get target user's public key
      const { publicKey: targetPubKeyStr } = await api.getUserPublicKey(inviteEmail);
      const targetPublicKey = fromBase64(targetPubKeyStr);

      // 5. Encrypt vault key for target using X25519 key exchange
      const sharedKey = shareVaultKeyForUser(vaultKey, ourPrivateKey, targetPublicKey, ourKeys.publicKey);

      await api.addVaultMember(vaultId, inviteEmail, inviteRole, JSON.stringify(sharedKey));
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('member');
      toast(`Invited ${inviteEmail}`, 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to invite member', 'error');
    } finally {
      setInviting(false);
    }
  }

  async function handleRoleChange(memberId: string, newRole: string) {
    try {
      await api.updateVaultMember(vaultId, memberId, newRole);
      toast('Role updated', 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to update role', 'error');
    }
  }

  async function handleRemove(member: Member) {
    const ok = await confirm({
      title: 'Remove Member',
      message: `Remove ${member.email} from this vault? They will lose access to all secrets.`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    try {
      await api.removeVaultMember(vaultId, member.user_id);
      toast('Member removed', 'success');
      await loadData();
    } catch (err: any) {
      toast(err.message || 'Failed to remove member', 'error');
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
            <span className="text-foreground">Members</span>
          </div>
          <h1 className="text-2xl font-bold">Team Members</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {members.length} member{members.length !== 1 ? 's' : ''} in this vault
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => setShowInvite(true)}>+ Invite</Button>
        )}
      </div>

      {/* Members list */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="divide-y divide-border">
          {members.map((member) => (
            <div key={member.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-medium shrink-0">
                  {member.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.email}
                    {member.user_id === user?.id && (
                      <span className="text-xs text-muted-foreground ml-2">(you)</span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Joined {new Date(member.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {isAdmin && member.role !== 'owner' && member.user_id !== user?.id ? (
                  <>
                    <select
                      value={member.role}
                      onChange={(e) => handleRoleChange(member.user_id, e.target.value)}
                      className="h-8 rounded-lg border border-border bg-muted px-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={() => handleRemove(member)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className={`text-xs font-medium ${ROLE_COLORS[member.role] || ''}`}>
                    {ROLE_LABELS[member.role] || member.role}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Invite Modal */}
      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            id="invite-email"
            label="Email Address"
            type="email"
            placeholder="teammate@example.com"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            required
          />
          <div className="space-y-1.5">
            <label htmlFor="invite-role" className="block text-sm font-medium text-muted-foreground">
              Role
            </label>
            <select
              id="invite-role"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="flex h-10 w-full rounded-lg border border-border bg-muted px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
            >
              <option value="admin">Admin — can manage secrets and members</option>
              <option value="member">Member — can read and write secrets</option>
              <option value="viewer">Viewer — read-only access</option>
            </select>
          </div>
          <div className="flex gap-3 justify-end">
            <Button type="button" variant="ghost" onClick={() => setShowInvite(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Inviting...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
