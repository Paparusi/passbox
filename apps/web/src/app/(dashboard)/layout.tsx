'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/lib/auth';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <nav className="border-b border-border">
        <div className="mx-auto max-w-6xl flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-6">
            <Link href="/vaults" className="text-lg font-bold">
              Pass<span className="text-primary">Box</span>
            </Link>
            <Link href="/vaults" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Vaults
            </Link>
            <Link href="/settings" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Settings
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button
              onClick={logout}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>
      <main className="mx-auto max-w-6xl px-4 py-8">
        {children}
      </main>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
