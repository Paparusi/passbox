import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl flex items-center justify-between h-14 px-4">
          <span className="text-lg font-bold">
            Pass<span className="text-primary">Box</span>
          </span>
          <div className="flex items-center gap-3">
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
            Open Source &middot; MIT License
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
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-4">
        <div className="mx-auto max-w-5xl flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <span>PassBox &middot; MIT License</span>
          <div className="flex items-center gap-6">
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
