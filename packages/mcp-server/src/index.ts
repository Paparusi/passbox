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
    },
    async ({ name, vault }) => {
      try {
        const value = await pb.secrets.get(name, { vault });
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
      description: z.string().optional().describe('Description of the secret'),
    },
    async ({ name, value, vault, description }) => {
      try {
        await pb.secrets.set(name, value, { vault, description });
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
    },
    async ({ vault }) => {
      try {
        const secrets = await pb.secrets.list({ vault });
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
    },
    async ({ name, vault }) => {
      try {
        await pb.secrets.delete(name, { vault });
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
    },
    async ({ url, method, headers, body, vault }) => {
      try {
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
          secretValues[name] = await pb.secrets.get(name, { vault });
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
