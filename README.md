<p align="center">
  <h1 align="center">PassBox</h1>
  <p align="center">
    <strong>Zero-knowledge secrets management for developers and AI agents</strong>
  </p>
  <p align="center">
    <a href="https://github.com/Paparusi/passbox/actions"><img src="https://github.com/Paparusi/passbox/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
    <a href="https://www.npmjs.com/package/@pabox/sdk"><img src="https://img.shields.io/npm/v/@pabox/sdk?label=sdk" alt="npm"></a>
    <a href="https://www.npmjs.com/package/pabox"><img src="https://img.shields.io/npm/v/pabox?label=cli" alt="CLI"></a>
    <a href="https://github.com/Paparusi/passbox/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="License"></a>
  </p>
  <p align="center">
    <a href="https://web-ten-rust-57.vercel.app">Web Dashboard</a> · <a href="https://api-production-db62.up.railway.app/api/v1/health">API Status</a> · <a href="https://www.npmjs.com/package/pabox">npm</a>
  </p>
</p>

---

PassBox is an open-source, end-to-end encrypted secrets manager built for developers, CI/CD pipelines, and AI agents. Your secrets are encrypted client-side before they ever leave your machine — the server **never** sees plaintext data.

## Why PassBox?

- **Zero-knowledge encryption** — Argon2id + AES-256-GCM + X25519. Server cannot decrypt your secrets.
- **CLI-first** — Manage secrets from your terminal. Inject into any process with `passbox run`.
- **AI agent native** — Built-in MCP server with credential brokering. AI agents use secrets without seeing them.
- **Developer SDK** — TypeScript SDK for programmatic access. `npm install @pabox/sdk`.
- **Self-hostable** — Run your own instance with Docker, or use the hosted cloud.
- **Team sharing** — Share vaults with role-based access via X25519 key exchange.
- **Version history** — Every secret change is tracked. Roll back anytime.
- **Audit logs** — Full audit trail of who accessed what and when.

## Quick Start

### Install the CLI

```bash
npm install -g pabox
```

### Basic Usage

```bash
# Login (creates account on first use)
passbox login

# Create a vault
passbox vault create my-app

# Store secrets
passbox set DATABASE_URL "postgres://user:pass@host/db"
passbox set API_KEY "sk-live-xxxxx"
passbox set JWT_SECRET "super-secret-key"

# Retrieve a secret
passbox get DATABASE_URL

# List all secrets
passbox list

# Inject secrets into a process
passbox run -- node server.js
# All vault secrets are now available as environment variables

# Import from .env file
passbox env push .env

# Export to .env file
passbox env pull
```

## SDK

```bash
npm install @pabox/sdk
```

```typescript
import { PassBox } from '@pabox/sdk';

// Authenticate with service token (for servers/CI)
const pb = new PassBox({
  serverUrl: 'https://api-production-db62.up.railway.app',
  token: 'pb_live_xxxxxxxxxxxx',
});

// Secret operations
await pb.secrets.set('DATABASE_URL', 'postgres://...');
const value = await pb.secrets.get('DATABASE_URL');
const all = await pb.secrets.list();

// Bulk .env operations
await pb.env.import('.env', { vault: 'my-app' });
const envString = await pb.env.export({ vault: 'my-app' });

// Inject into process.env
await pb.env.inject({ vault: 'my-app' });
console.log(process.env.DATABASE_URL); // available now
```

## MCP Server (AI Agents)

PassBox includes an MCP server that lets AI agents (Claude, GPT, etc.) securely access secrets without exposing raw values.

```bash
npm install -g @pabox/mcp-server
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "passbox": {
      "command": "npx",
      "args": ["@pabox/mcp-server"],
      "env": {
        "PASSBOX_TOKEN": "pb_live_xxxxxxxxxxxx",
        "PASSBOX_SERVER": "https://api-production-db62.up.railway.app"
      }
    }
  }
}
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `passbox_get_secret` | Get a secret value |
| `passbox_set_secret` | Create or update a secret |
| `passbox_list_secrets` | List secrets in a vault |
| `passbox_delete_secret` | Delete a secret |
| `passbox_list_vaults` | List available vaults |
| `passbox_proxy_request` | Make HTTP requests with secrets injected (credential brokering) |

### Credential Brokering

The `passbox_proxy_request` tool lets AI agents make API calls using your secrets **without ever seeing the raw credentials**:

```
Agent: "Call the Stripe API to list customers"
→ PassBox replaces {{STRIPE_KEY}} with the actual key
→ Makes the HTTP request server-side
→ Returns the response to the agent
→ Agent never sees the API key
```

## Architecture

### Encryption

```
Master Password
    │
    ▼ Argon2id (3 iterations, 64MB memory, 4 parallelism)
    │
Master Key (256-bit)
    │
    ├──► Encrypts vault keys (AES-256-GCM)
    │
    └──► X25519 key pair
         ├── Public key → stored on server (for sharing)
         └── Private key → encrypted, stored on server
```

Every secret is encrypted with AES-256-GCM using a per-vault key. Vault keys are encrypted with your master key. The server stores only ciphertext — decryption happens entirely on the client.

Crypto libraries: [@noble/ciphers](https://github.com/paulmillr/noble-ciphers), [@noble/curves](https://github.com/paulmillr/noble-curves), [@noble/hashes](https://github.com/paulmillr/noble-hashes) — audited by Cure53, zero dependencies.

### Monorepo Structure

```
passbox/
├── apps/
│   ├── server/          # Hono API server
│   ├── cli/             # CLI tool (passbox command)
│   └── web/             # Web dashboard (coming soon)
├── packages/
│   ├── types/           # Shared TypeScript types
│   ├── crypto/          # E2E encryption library
│   ├── sdk/             # TypeScript SDK
│   ├── mcp-server/      # MCP server for AI agents
│   └── config/          # Shared configs
├── supabase/            # Database migrations
└── docker/              # Docker setup
```

## Self-Hosting

### Docker

```bash
git clone https://github.com/Paparusi/passbox.git
cd passbox

# Configure environment
cp .env.example .env
# Edit .env with your Supabase credentials

# Build and run
docker build -f docker/Dockerfile.server -t passbox-server .
docker run -p 3000:3000 --env-file .env passbox-server
```

### Manual

```bash
git clone https://github.com/Paparusi/passbox.git
cd passbox
pnpm install
pnpm build

# Start server
node --env-file=.env apps/server/dist/index.js
```

### Database Setup

PassBox uses [Supabase](https://supabase.com) (PostgreSQL + Auth + Row Level Security).

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migrations:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
3. Copy your project URL, anon key, and service role key to `.env`

## CLI Commands

| Command | Description |
|---------|-------------|
| `passbox login` | Login or create account |
| `passbox logout` | Clear local session |
| `passbox vault create <name>` | Create a new vault |
| `passbox vault list` | List your vaults |
| `passbox vault delete <name>` | Delete a vault |
| `passbox get <name>` | Get a secret value |
| `passbox set <name> <value>` | Set a secret |
| `passbox delete <name>` | Delete a secret |
| `passbox list` | List all secrets in current vault |
| `passbox env push <file>` | Import .env file to vault |
| `passbox env pull` | Export vault to .env file |
| `passbox run -- <cmd>` | Run command with secrets as env vars |
| `passbox serve` | Start MCP server |
| `passbox whoami` | Show current user |

## API

Base URL: `https://api-production-db62.up.railway.app/api/v1`

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/auth/register` | POST | Register + generate keys |
| `/auth/login` | POST | Login + receive JWT |
| `/vaults` | GET/POST | List/create vaults |
| `/vaults/:id` | GET/PUT/DELETE | Vault CRUD |
| `/vaults/:id/members` | GET/POST | Vault sharing |
| `/vaults/:vid/secrets` | GET/POST | List/create secrets |
| `/vaults/:vid/secrets/:name` | GET/PUT/DELETE | Secret CRUD |
| `/vaults/:vid/secrets/:name/versions` | GET | Version history |
| `/audit` | GET | Audit logs |

## npm Packages

| Package | Description | Install |
|---------|-------------|---------|
| [`pabox`](https://www.npmjs.com/package/pabox) | CLI tool | `npm i -g pabox` |
| [`@pabox/sdk`](https://www.npmjs.com/package/@pabox/sdk) | TypeScript SDK | `npm i @pabox/sdk` |
| [`@pabox/mcp-server`](https://www.npmjs.com/package/@pabox/mcp-server) | MCP server | `npx @pabox/mcp-server` |
| [`@pabox/crypto`](https://www.npmjs.com/package/@pabox/crypto) | Encryption library | `npm i @pabox/crypto` |
| [`@pabox/types`](https://www.npmjs.com/package/@pabox/types) | TypeScript types | `npm i @pabox/types` |

## Contributing

We welcome contributions! PassBox is MIT licensed.

```bash
# Setup
git clone https://github.com/Paparusi/passbox.git
cd passbox
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm --filter @pabox/crypto test

# Start dev server
pnpm --filter @pabox/server dev
```

## Security

PassBox is designed with zero-knowledge architecture. If you discover a security vulnerability, please email **security@passbox.dev** instead of opening a public issue.

## License

[MIT](LICENSE) — free to use, modify, and distribute.
