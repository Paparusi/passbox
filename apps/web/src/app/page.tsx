import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-5xl font-bold tracking-tight">
            Pass<span className="text-primary">Box</span>
          </h1>
          <p className="text-xl text-muted-foreground">
            Zero-knowledge secrets management for developers and AI agents
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="text-2xl">🔐</div>
            <h3 className="font-semibold">E2E Encrypted</h3>
            <p className="text-sm text-muted-foreground">
              AES-256-GCM + Argon2id. Server never sees plaintext.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="text-2xl">⚡</div>
            <h3 className="font-semibold">Developer First</h3>
            <p className="text-sm text-muted-foreground">
              CLI, SDK, .env integration. Built for your workflow.
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-5 space-y-2">
            <div className="text-2xl">🤖</div>
            <h3 className="font-semibold">AI Agent Native</h3>
            <p className="text-sm text-muted-foreground">
              MCP server with credential brokering for LLMs.
            </p>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded-lg bg-primary px-8 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Get Started
          </Link>
          <a
            href="https://github.com/Paparusi/passbox"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center rounded-lg border border-border px-8 text-sm font-medium hover:bg-muted transition-colors"
          >
            GitHub
          </a>
        </div>

        <p className="text-sm text-muted-foreground">
          Install CLI: <code className="rounded bg-muted px-2 py-0.5 text-foreground">npm install -g pabox</code>
        </p>
      </div>
    </div>
  );
}
