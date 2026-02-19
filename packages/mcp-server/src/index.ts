import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { PassBox } from '@pabox/sdk';

// Initialize PassBox client from environment
function createClient(): PassBox {
  const token = process.env.PASSBOX_TOKEN;
  const serverUrl = process.env.PASSBOX_SERVER || 'https://api.passbox.dev';

  if (!token) {
    throw new Error(
      'PASSBOX_TOKEN environment variable is required. ' +
      'Create a service token: passbox auth service-token create',
    );
  }

  return new PassBox({ serverUrl, token });
}

function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'passbox',
    version: '0.1.0',
  });

  const pb = createClient();

  // ─── Tool: Get Secret ──────────────────────────────
  server.tool(
    'passbox_get_secret',
    'Get a secret value from PassBox vault',
    {
      name: z.string().describe('Name of the secret (e.g., DATABASE_URL, API_KEY)'),
      vault: z.string().optional().describe('Vault name or ID (uses default if omitted)'),
      env: z.string().optional().describe('Environment name (e.g. development, staging, production)'),
    },
    async ({ name, vault, env }) => {
      try {
        const value = await pb.secrets.get(name, { vault, env });
        return {
          content: [{ type: 'text' as const, text: value }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Set Secret ──────────────────────────────
  server.tool(
    'passbox_set_secret',
    'Create or update a secret in PassBox vault',
    {
      name: z.string().describe('Name of the secret'),
      value: z.string().describe('Secret value to store (will be encrypted)'),
      vault: z.string().optional().describe('Vault name or ID'),
      env: z.string().optional().describe('Environment name (e.g. development, staging, production)'),
      description: z.string().optional().describe('Description of the secret'),
    },
    async ({ name, value, vault, env, description }) => {
      try {
        await pb.secrets.set(name, value, { vault, env, description });
        return {
          content: [{ type: 'text' as const, text: `Secret "${name}" saved successfully` }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: List Secrets ────────────────────────────
  server.tool(
    'passbox_list_secrets',
    'List all secret names in a vault',
    {
      vault: z.string().optional().describe('Vault name or ID'),
      env: z.string().optional().describe('Environment name (e.g. development, staging, production)'),
    },
    async ({ vault, env }) => {
      try {
        const secrets = await pb.secrets.list({ vault, env });
        const names = secrets.map(s => `${s.name} (v${s.version})`);
        return {
          content: [{
            type: 'text' as const,
            text: names.length > 0
              ? `Secrets:\n${names.map(n => `  - ${n}`).join('\n')}`
              : 'No secrets found in this vault',
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Delete Secret ───────────────────────────
  server.tool(
    'passbox_delete_secret',
    'Delete a secret from PassBox vault',
    {
      name: z.string().describe('Name of the secret to delete'),
      vault: z.string().optional().describe('Vault name or ID'),
      env: z.string().optional().describe('Environment name (e.g. development, staging, production)'),
    },
    async ({ name, vault, env }) => {
      try {
        await pb.secrets.delete(name, { vault, env });
        return {
          content: [{ type: 'text' as const, text: `Secret "${name}" deleted` }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: List Vaults ─────────────────────────────
  server.tool(
    'passbox_list_vaults',
    'List all available vaults',
    {},
    async () => {
      try {
        const vaultList = await pb.vaults.list();
        const formatted = vaultList.map(v =>
          `  - ${v.name} (${v.id.slice(0, 8)}...) [${v.role || 'member'}]`
        );
        return {
          content: [{
            type: 'text' as const,
            text: vaultList.length > 0
              ? `Vaults:\n${formatted.join('\n')}`
              : 'No vaults found',
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: List Environments ────────────────────────
  server.tool(
    'passbox_list_environments',
    'List environments in a vault (e.g. development, staging, production)',
    {
      vault: z.string().optional().describe('Vault name or ID'),
    },
    async ({ vault }) => {
      try {
        const envs = await pb.environments.list({ vault });
        const formatted = envs.map(e =>
          `  - ${e.name}${e.is_default ? ' (default)' : ''}${e.description ? ` — ${e.description}` : ''}`
        );
        return {
          content: [{
            type: 'text' as const,
            text: envs.length > 0
              ? `Environments:\n${formatted.join('\n')}`
              : 'No environments found',
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Get Environment (all secrets as key-value) ──
  server.tool(
    'passbox_get_environment',
    'Get all secrets in a specific environment as key-value pairs. Useful for seeing all config for an environment at once.',
    {
      vault: z.string().optional().describe('Vault name or ID'),
      env: z.string().optional().describe('Environment name (e.g. development, staging, production)'),
    },
    async ({ vault, env }) => {
      try {
        const secrets = await pb.secrets.getAll({ vault, env });
        const entries = Object.entries(secrets)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => `${k}=${v}`)
          .join('\n');
        return {
          content: [{
            type: 'text' as const,
            text: entries || 'No secrets found',
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Diff Env (compare local .env with vault) ──
  server.tool(
    'passbox_diff_env',
    'Compare local .env file content with vault secrets. Shows missing, extra, and different values. Useful for syncing environments.',
    {
      envContent: z.string().describe('Content of the local .env file'),
      vault: z.string().optional().describe('Vault name or ID'),
      env: z.string().optional().describe('Environment name to compare against'),
    },
    async ({ envContent, vault, env }) => {
      try {
        // Parse local .env
        const local = pb.env.parse(envContent);
        const remote = await pb.secrets.getAll({ vault, env });

        const localKeys = new Set(Object.keys(local));
        const remoteKeys = new Set(Object.keys(remote));

        const missing: string[] = []; // in remote but not local
        const extra: string[] = [];   // in local but not remote
        const different: string[] = []; // in both but different values
        const same: string[] = [];

        for (const key of remoteKeys) {
          if (!localKeys.has(key)) {
            missing.push(key);
          } else if (local[key] !== remote[key]) {
            different.push(key);
          } else {
            same.push(key);
          }
        }

        for (const key of localKeys) {
          if (!remoteKeys.has(key)) {
            extra.push(key);
          }
        }

        const lines: string[] = [];
        if (missing.length > 0) lines.push(`Missing locally (in vault but not in .env):\n${missing.map(k => `  - ${k}`).join('\n')}`);
        if (extra.length > 0) lines.push(`Extra locally (in .env but not in vault):\n${extra.map(k => `  + ${k}`).join('\n')}`);
        if (different.length > 0) lines.push(`Different values:\n${different.map(k => `  ~ ${k}`).join('\n')}`);
        lines.push(`\nSummary: ${same.length} matching, ${missing.length} missing, ${extra.length} extra, ${different.length} different`);

        return {
          content: [{ type: 'text' as const, text: lines.join('\n\n') }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Import Env (import .env content into vault) ──
  server.tool(
    'passbox_import_env',
    'Import .env file content into a vault. Creates new secrets and updates existing ones. All values are encrypted before storage.',
    {
      envContent: z.string().describe('Content of the .env file to import'),
      vault: z.string().optional().describe('Vault name or ID'),
      env: z.string().optional().describe('Target environment name'),
    },
    async ({ envContent, vault, env }) => {
      try {
        const result = await pb.env.import(envContent, { vault, env });
        return {
          content: [{
            type: 'text' as const,
            text: `Import complete: ${result.created} created, ${result.updated} updated`,
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Rotate Secret ──────────────────────────
  server.tool(
    'passbox_rotate_secret',
    'Trigger manual rotation for a secret. Fires the secret.rotated webhook event and updates rotation tracking.',
    {
      name: z.string().describe('Name of the secret to rotate'),
      vault: z.string().optional().describe('Vault name or ID'),
    },
    async ({ name, vault }) => {
      try {
        // We need to call the rotation API directly via the proxy approach
        // since the SDK doesn't have a rotate method yet
        const vaults = await pb.vaults.list();
        const targetVault = vault
          ? vaults.find(v => v.name === vault || v.id === vault)
          : vaults[0];

        if (!targetVault) {
          return {
            content: [{ type: 'text' as const, text: 'Error: Vault not found' }],
            isError: true,
          };
        }

        const result = await pb.request(`/vaults/${targetVault.id}/secrets/${encodeURIComponent(name)}/rotate`, {
          method: 'POST',
        });

        return {
          content: [{
            type: 'text' as const,
            text: `Secret "${name}" rotated successfully at ${result.rotatedAt || new Date().toISOString()}`,
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  // ─── Tool: Proxy Request (Credential Brokering) ───
  server.tool(
    'passbox_proxy_request',
    'Make an HTTP request with secrets injected. Secrets are referenced as {{SECRET_NAME}} in URL, headers, or body. The actual secret values are never exposed to the AI agent.',
    {
      url: z.string().describe('URL with optional {{SECRET_NAME}} placeholders'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      headers: z.record(z.string()).optional().describe('Headers with optional {{SECRET_NAME}} placeholders'),
      body: z.string().optional().describe('Request body with optional {{SECRET_NAME}} placeholders'),
      vault: z.string().optional().describe('Vault to resolve secrets from'),
      env: z.string().optional().describe('Environment name (e.g. development, staging, production)'),
    },
    async ({ url, method, headers, body, vault, env }) => {
      try {
        // SSRF protection: validate target URL
        try {
          const parsed = new URL(url.replace(/\{\{\w+\}\}/g, 'placeholder'));
          const host = parsed.hostname.toLowerCase();
          if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
            return { content: [{ type: 'text' as const, text: 'Error: Only HTTP(S) URLs are allowed' }], isError: true };
          }
          if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '0.0.0.0') {
            return { content: [{ type: 'text' as const, text: 'Error: Cannot make requests to localhost' }], isError: true };
          }
          if (host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('172.') || host === '169.254.169.254') {
            return { content: [{ type: 'text' as const, text: 'Error: Cannot make requests to private networks' }], isError: true };
          }
        } catch {
          return { content: [{ type: 'text' as const, text: 'Error: Invalid URL' }], isError: true };
        }

        // Find all {{SECRET_NAME}} placeholders
        const pattern = /\{\{(\w+)\}\}/g;
        const allText = `${url} ${JSON.stringify(headers || {})} ${body || ''}`;
        const secretNames = new Set<string>();
        let match;
        while ((match = pattern.exec(allText)) !== null) {
          secretNames.add(match[1]);
        }

        // Resolve secrets
        const secretValues: Record<string, string> = {};
        for (const name of secretNames) {
          secretValues[name] = await pb.secrets.get(name, { vault, env });
        }

        // Replace placeholders
        const replacePlaceholders = (str: string) =>
          str.replace(/\{\{(\w+)\}\}/g, (_, name) => secretValues[name] || '');

        const resolvedUrl = replacePlaceholders(url);
        const resolvedHeaders: Record<string, string> = {};
        if (headers) {
          for (const [key, value] of Object.entries(headers)) {
            resolvedHeaders[key] = replacePlaceholders(value);
          }
        }
        const resolvedBody = body ? replacePlaceholders(body) : undefined;

        // Make the actual request
        const response = await fetch(resolvedUrl, {
          method,
          headers: resolvedHeaders,
          body: resolvedBody,
        });

        const responseText = await response.text();

        return {
          content: [{
            type: 'text' as const,
            text: `HTTP ${response.status} ${response.statusText}\n\n${responseText}`,
          }],
        };
      } catch (err: any) {
        return {
          content: [{ type: 'text' as const, text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    },
  );

  return server;
}

export interface McpServerOptions {
  mode: 'stdio' | 'sse';
  port?: number;
}

export async function startMcpServer(options: McpServerOptions = { mode: 'stdio' }) {
  const server = createMcpServer();

  if (options.mode === 'stdio') {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  }
}

// Auto-start if run directly
const isDirectRun = process.argv[1]?.includes('mcp-server') ||
                    process.argv[1]?.includes('passbox-mcp');
if (isDirectRun) {
  startMcpServer({ mode: 'stdio' }).catch(console.error);
}
