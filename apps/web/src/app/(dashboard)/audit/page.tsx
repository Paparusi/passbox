'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';

interface AuditLog {
  id: string;
  action: string;
  resource_type: string;
  resource_id: string | null;
  user_id: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

const ACTION_LABELS: Record<string, string> = {
  'secret.create': 'Created secret',
  'secret.read': 'Read secret',
  'secret.update': 'Updated secret',
  'secret.delete': 'Deleted secret',
  'vault.create': 'Created vault',
  'vault.update': 'Updated vault',
  'vault.delete': 'Deleted vault',
  'member.add': 'Added member',
  'member.remove': 'Removed member',
  'member.update': 'Updated member role',
};

export default function AuditPage() {
  const { toast } = useToast();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [filter, setFilter] = useState('');

  async function loadLogs(p: number) {
    setLoading(true);
    try {
      const params: any = { page: p, pageSize: 25 };
      if (filter) params.action = filter;
      const data = await api.getAuditLogs(params);
      setLogs(data.items || []);
      setHasMore(data.hasMore);
      setTotal(data.total);
      setPage(data.page);
    } catch (err: any) {
      toast(err.message || 'Failed to load audit logs', 'error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLogs(1);
  }, [filter]);

  function formatAction(action: string): string {
    return ACTION_LABELS[action] || action;
  }

  function timeAgo(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Track who accessed what and when
        </p>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">All actions</option>
          <option value="secret.create">Secret created</option>
          <option value="secret.read">Secret read</option>
          <option value="secret.update">Secret updated</option>
          <option value="secret.delete">Secret deleted</option>
          <option value="vault.create">Vault created</option>
          <option value="vault.delete">Vault deleted</option>
          <option value="member.add">Member added</option>
          <option value="member.remove">Member removed</option>
        </select>
        <span className="text-sm text-muted-foreground">
          {total} event{total !== 1 ? 's' : ''}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-border rounded-xl">
          <div className="text-4xl mb-4">&#x1f4cb;</div>
          <h3 className="text-lg font-semibold mb-2">No audit logs yet</h3>
          <p className="text-muted-foreground text-sm">
            Activity will appear here as you use PassBox
          </p>
        </div>
      ) : (
        <>
          <div className="border border-border rounded-xl overflow-hidden">
            {/* Desktop table */}
            <table className="w-full hidden md:table">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">ACTION</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">RESOURCE</th>
                  <th className="text-left text-xs font-medium text-muted-foreground px-4 py-3">TIME</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-sm">{formatAction(log.action)}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground font-mono">
                        {log.resource_type}
                        {log.resource_id ? ` ${log.resource_id.slice(0, 8)}...` : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-muted-foreground" title={new Date(log.created_at).toLocaleString()}>
                        {timeAgo(log.created_at)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Mobile list */}
            <div className="md:hidden divide-y divide-border">
              {logs.map((log) => (
                <div key={log.id} className="px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{formatAction(log.action)}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(log.created_at)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">
                    {log.resource_type}{log.resource_id ? ` ${log.resource_id.slice(0, 8)}...` : ''}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={page <= 1}
              onClick={() => loadLogs(page - 1)}
            >
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={!hasMore}
              onClick={() => loadLogs(page + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
