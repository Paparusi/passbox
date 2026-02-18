# Contributing to PassBox

Thanks for your interest in contributing to PassBox! This guide will help you get started.

## Development Setup

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- A Supabase project (or local instance via Docker)

### Getting Started

```bash
# Clone the repo
git clone https://github.com/Paparusi/passbox.git
cd passbox

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# Build all packages
pnpm build

# Run tests
pnpm --filter @pabox/crypto test

# Start the API server (dev mode)
pnpm --filter @pabox/server dev

# Start the web dashboard (dev mode)
pnpm --filter @pabox/web dev
```

### Monorepo Structure

| Package | Path | Description |
|---------|------|-------------|
| `@pabox/types` | `packages/types` | Shared TypeScript types |
| `@pabox/crypto` | `packages/crypto` | E2E encryption (Argon2id + AES-256-GCM + X25519) |
| `@pabox/sdk` | `packages/sdk` | TypeScript SDK |
| `@pabox/mcp-server` | `packages/mcp-server` | MCP server for AI agents |
| `@pabox/server` | `apps/server` | Hono API server |
| `pabox` | `apps/cli` | CLI tool (binary: `passbox`) |
| `@pabox/web` | `apps/web` | Next.js web dashboard |

### Build Order

Turborepo handles the build dependency graph automatically:

```
@pabox/types -> @pabox/crypto -> @pabox/sdk -> pabox (CLI)
                                            -> @pabox/mcp-server
                              -> @pabox/server
@pabox/web (independent)
```

## Making Changes

1. **Create a branch** from `main`
2. **Make your changes** with clear, focused commits
3. **Run tests** to make sure nothing is broken: `pnpm --filter @pabox/crypto test`
4. **Build** to verify: `pnpm build`
5. **Open a PR** against `main`

### Code Style

- TypeScript everywhere
- ESM modules (`"type": "module"`)
- Prefer small, focused functions
- No unnecessary abstractions

### Commit Messages

Use clear, descriptive commit messages:

```
Fix vault creation RLS policy for new users
Add copy-to-clipboard button for secret values
Update Argon2id test timeout for CI runners
```

## Reporting Issues

- Use GitHub Issues for bugs and feature requests
- Include reproduction steps for bugs
- Check existing issues before creating a new one

## Security

If you discover a security vulnerability, please see [SECURITY.md](SECURITY.md) for responsible disclosure instructions. **Do not open a public issue for security vulnerabilities.**

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
