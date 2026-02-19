'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { useConfirm } from '@/components/ui/confirm';
import { api } from '@/lib/api';

interface WaitlistEntry {
  id: string;
  email: string;
  source: string;
  created_at: string;
}

export default function AdminWaitlistPage() {
  const { toast } = useToast();
  const { confirm } = useConfirm();
  const router = useRouter();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [deleting, setDeleting] = useState<string | null>(null);

  async function loadWaitlist(p: number) {
    setLoading(true);
    try {
      const data = await api.adminGetWaitlist({ page: p, pageSize: 25 });
      setEntries(data.items);
      setPage(data.page);
      setHasMore(data.hasMore);
      setTotal(data.total);
    } catch (err: any) {
      if (err.message?.includes('FORBIDDEN')) {
        toast('Access denied', 'error');
        router.push('/vaults');
        return;
      }
      toast(err.message || 'Failed to load waitlist', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadWaitlist(1); }, []);

  async function handleDelete(entry: WaitlistEntry) {
    const ok = await confirm({
      title: 'Remove from Waitlist',
      message: `Remove ${entry.email} from the waitlist?`,
      confirmLabel: 'Remove',
      destructive: true,
    });
    if (!ok) return;

    setDeleting(entry.id);
    try {
      await api.adminDeleteWaitlistEntry(entry.id);
      setEntries(prev => prev.filter(e => e.id !== entry.id));
      setTotal(t => t - 1);
      toast('Removed from waitlist', 'success');
    } catch (err: any) {
      toast(err.message || 'Failed to remove', 'error');
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Waitlist</h1>
        <p className="text-muted-foreground text-sm mt-1">
          {total} {total === 1 ? 'person' : 'people'} on the waitlist
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <h3 className="text-lg font-semibold mb-2">Waitlist is empty</h3>
          <p className="text-muted-foreground text-sm">No one has joined the waitlist yet</p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Desktop table */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">EMAIL</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">SOURCE</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">DATE</th>
                  <th className="text-right text-xs font-medium text-muted-foreground px-4 py-3">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-sm">{entry.email}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{entry.source}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(entry)}
                        disabled={deleting === entry.id}
                      >
                        {deleting === entry.id ? '...' : 'Remove'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {entries.map((entry) => (
                <div key={entry.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{entry.email}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry)}
                      disabled={deleting === entry.id}
                    >
                      {deleting === entry.id ? '...' : 'Remove'}
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {entry.source} | {new Date(entry.created_at).toLocaleDateString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => loadWaitlist(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button variant="ghost" size="sm" disabled={!hasMore} onClick={() => loadWaitlist(page + 1)}>
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
