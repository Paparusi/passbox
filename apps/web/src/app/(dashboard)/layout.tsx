'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ToastProvider } from '@/components/ui/toast';
import { ConfirmProvider } from '@/components/ui/confirm';
import { api } from '@/lib/api';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      api.adminCheck().then(() => setIsAdmin(true)).catch(() => {});
    }
  }, [user]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const navLinks = [
    { href: '/vaults', label: 'Vaults' },
    { href: '/audit', label: 'Audit' },
    { href: '/billing', label: 'Billing' },
    { href: '/settings', label: 'Settings' },
    ...(isAdmin ? [{ href: '/admin', label: 'Admin' }] : []),
  ];

  return (
    <ToastProvider>
      <ConfirmProvider>
        <div className="min-h-screen">
          <nav className="border-b border-border">
            <div className="mx-auto max-w-6xl flex items-center justify-between h-14 px-4">
              <div className="flex items-center gap-6">
                <Link href="/vaults" className="text-lg font-bold">
                  Pass<span className="text-primary">Box</span>
                </Link>
                {/* Desktop nav */}
                <div className="hidden sm:flex items-center gap-4">
                  {navLinks.map(link => (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`text-sm transition-colors ${
                        pathname === link.href || pathname.startsWith(link.href + '/')
                          ? 'text-foreground font-medium'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {link.label}
                    </Link>
                  ))}
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-4">
                <span className="text-sm text-muted-foreground">{user.email}</span>
                <button
                  onClick={logout}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Logout
                </button>
              </div>
              {/* Mobile hamburger */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="sm:hidden text-muted-foreground hover:text-foreground p-1"
                aria-label="Toggle menu"
              >
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  {mobileMenuOpen ? (
                    <path d="M4 4L16 16M16 4L4 16" />
                  ) : (
                    <path d="M3 5h14M3 10h14M3 15h14" />
                  )}
                </svg>
              </button>
            </div>
            {/* Mobile menu */}
            {mobileMenuOpen && (
              <div className="sm:hidden border-t border-border px-4 py-3 space-y-2 bg-card">
                {navLinks.map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block text-sm py-1 ${
                      pathname === link.href || pathname.startsWith(link.href + '/')
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                  <button
                    onClick={logout}
                    className="text-sm text-muted-foreground hover:text-foreground mt-1"
                  >
                    Logout
                  </button>
                </div>
              </div>
            )}
          </nav>
          {user && user.emailVerified === false && (
            <div className="mx-auto max-w-6xl px-4 pt-4">
              <div className="rounded-lg bg-warning/10 border border-warning/30 p-3 text-sm text-warning">
                Please verify your email address. Check your inbox for a confirmation link.
              </div>
            </div>
          )}
          <main className="mx-auto max-w-6xl px-4 py-8">
            {children}
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <DashboardShell>{children}</DashboardShell>
    </AuthProvider>
  );
}
