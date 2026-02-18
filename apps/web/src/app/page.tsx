'use client';

import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

export default function HomePage() {
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [waitlistMessage, setWaitlistMessage] = useState('');

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    setWaitlistStatus('loading');
    try {
      const result = await api.joinWaitlist(waitlistEmail);
      setWaitlistStatus('done');
      setWaitlistMessage(result.message);
      setWaitlistEmail('');
    } catch (err: any) {
      setWaitlistStatus('error');
      setWaitlistMessage(err.message || 'Something went wrong');
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between h-14 px-4">
          <span className="text-lg font-bold">
            Pass<span className="text-primary">Box</span>
          </span>
          <div className="flex items-center gap-3">
            <Link href="/pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              Pricing
            </Link>
            <Link
              href="/login"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1">
        <section className="mx-auto max-w-3xl text-center px-4 pt-20 pb-16 space-y-6">
          <div className="inline-flex items-center rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
            Open Source &middot; MIT License &middot; Free Forever
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight leading-tight">
            Secrets management for<br />
            <span className="text-primary">developers</span> and{' '}
            <span className="text-primary">AI agents</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-xl mx-auto">
            Zero-knowledge E2E encryption. CLI-native. MCP server for AI agents with credential brokering. Self-hostable.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <Link
              href="/register"
              className="inline-flex h-12 items-center rounded-lg bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Free
            </Link>
            <a
              href="https://github.com/Paparusi/passbox"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-12 items-center rounded-lg border border-border px-8 text-sm font-medium hover:bg-muted transition-colors"
            >
              View on GitHub
            </a>
          </div>
          <div className="pt-4">
            <code className="rounded-lg bg-muted border border-border px-4 py-2 text-sm inline-block">
              npm install -g pabox
            </code>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold">E2E</div>
              <h3 className="font-semibold">Zero-Knowledge Encryption</h3>
              <p className="text-sm text-muted-foreground">
                AES-256-GCM + Argon2id + X25519. Server never sees your plaintext secrets.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-mono text-sm font-bold">&gt;_</div>
              <h3 className="font-semibold">CLI Native</h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">passbox get</code>, <code className="text-xs">passbox set</code>, <code className="text-xs">passbox run</code>. Inject secrets into any process.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">MCP</div>
              <h3 className="font-semibold">AI Agent Native</h3>
              <p className="text-sm text-muted-foreground">
                MCP server with credential brokering. AI agents use secrets without seeing them.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">.env</div>
              <h3 className="font-semibold">.env Integration</h3>
              <p className="text-sm text-muted-foreground">
                Import and export .env files. Replace scattered dotenv files with a vault.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">SDK</div>
              <h3 className="font-semibold">TypeScript SDK</h3>
              <p className="text-sm text-muted-foreground">
                <code className="text-xs">@pabox/sdk</code> for Node.js, Deno, Bun. Drop-in for your apps and CI/CD.
              </p>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 space-y-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-sm">OSS</div>
              <h3 className="font-semibold">Self-Hostable</h3>
              <p className="text-sm text-muted-foreground">
                Docker Compose one-liner. MIT licensed. Your infrastructure, your data.
              </p>
            </div>
          </div>
        </section>

        {/* CLI Demo */}
        <section className="mx-auto max-w-3xl px-4 pb-20">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/50">
              <div className="h-3 w-3 rounded-full bg-destructive/60" />
              <div className="h-3 w-3 rounded-full bg-warning/60" />
              <div className="h-3 w-3 rounded-full bg-success/60" />
              <span className="text-xs text-muted-foreground ml-2">Terminal</span>
            </div>
            <div className="p-5 font-mono text-sm space-y-2">
              <div><span className="text-success">$</span> passbox login</div>
              <div className="text-muted-foreground">Authenticated as dev@example.com</div>
              <div className="mt-3"><span className="text-success">$</span> passbox set DATABASE_URL &quot;postgres://...&quot;</div>
              <div className="text-muted-foreground">Secret set in vault &quot;default&quot; (v1)</div>
              <div className="mt-3"><span className="text-success">$</span> passbox run -- node server.js</div>
              <div className="text-muted-foreground">Injected 12 secrets into process</div>
              <div className="text-primary">Server running on :3000</div>
            </div>
          </div>
        </section>

        {/* Pricing Preview */}
        <section className="mx-auto max-w-5xl px-4 pb-20">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold">Simple pricing</h2>
            <p className="text-muted-foreground mt-2">Start free. Scale as you grow.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto">
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
              <h3 className="font-semibold">Free</h3>
              <p className="text-3xl font-bold">$0</p>
              <p className="text-sm text-muted-foreground">3 vaults, 50 secrets each</p>
              <Link href="/register" className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors">
                Get Started
              </Link>
            </div>
            <div className="rounded-xl border border-primary bg-primary/5 p-6 text-center space-y-3 shadow-lg shadow-primary/10">
              <h3 className="font-semibold">Pro</h3>
              <p className="text-3xl font-bold">$12<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-sm text-muted-foreground">Unlimited everything</p>
              <Link href="/register?plan=pro" className="inline-flex h-9 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                Start Trial
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-card p-6 text-center space-y-3">
              <h3 className="font-semibold">Team</h3>
              <p className="text-3xl font-bold">$28<span className="text-sm font-normal text-muted-foreground">/mo</span></p>
              <p className="text-sm text-muted-foreground">SSO + Advanced security</p>
              <Link href="/pricing" className="inline-flex h-9 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted transition-colors">
                See Details
              </Link>
            </div>
          </div>
          <div className="text-center mt-6">
            <Link href="/pricing" className="text-sm text-primary hover:underline">
              View full comparison &rarr;
            </Link>
          </div>
        </section>

        {/* Waitlist / Cloud */}
        <section className="mx-auto max-w-3xl px-4 pb-20">
          <div className="rounded-xl border border-border bg-card p-8 text-center space-y-4">
            <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              Coming Soon
            </div>
            <h2 className="text-2xl font-bold">PassBox Cloud</h2>
            <p className="text-muted-foreground max-w-md mx-auto">
              Managed hosting with zero setup. All the power of self-hosted PassBox, without the infrastructure.
              Join the waitlist for early access.
            </p>
            {waitlistStatus === 'done' ? (
              <div className="rounded-lg bg-success/10 border border-success/30 px-4 py-3 text-sm text-success">
                {waitlistMessage}
              </div>
            ) : (
              <form onSubmit={handleWaitlist} className="flex gap-2 max-w-sm mx-auto">
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={waitlistEmail}
                  onChange={(e) => setWaitlistEmail(e.target.value)}
                  required
                  className="flex-1 h-10 rounded-lg border border-border bg-muted px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent transition-colors"
                />
                <button
                  type="submit"
                  disabled={waitlistStatus === 'loading'}
                  className="inline-flex h-10 items-center rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {waitlistStatus === 'loading' ? 'Joining...' : 'Join Waitlist'}
                </button>
              </form>
            )}
            {waitlistStatus === 'error' && (
              <p className="text-xs text-destructive">{waitlistMessage}</p>
            )}
          </div>
        </section>

        {/* Social Proof */}
        <section className="mx-auto max-w-4xl px-4 pb-20">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">MIT</p>
              <p className="text-xs text-muted-foreground">Open Source License</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">E2E</p>
              <p className="text-xs text-muted-foreground">Zero-Knowledge</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">5</p>
              <p className="text-xs text-muted-foreground">npm Packages</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-primary">41</p>
              <p className="text-xs text-muted-foreground">Tests Passing</p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>PassBox &middot; MIT License</span>
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="hover:text-foreground transition-colors">
              Pricing
            </Link>
            <a href="https://github.com/Paparusi/passbox" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              GitHub
            </a>
            <a href="https://www.npmjs.com/package/pabox" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              npm
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
