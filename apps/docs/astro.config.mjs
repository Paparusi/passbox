import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
  site: 'https://docs.passbox.dev',
  legacy: { collections: true },
  integrations: [
    starlight({
      title: 'PassBox',
      description: 'Zero-knowledge secrets management for developers and AI agents.',
      social: [
        { icon: 'github', label: 'GitHub', href: 'https://github.com/Paparusi/passbox' },
      ],
      customCss: ['./src/styles/custom.css'],
      sidebar: [
        {
          label: 'Getting Started',
          items: [
            { label: 'Introduction', slug: 'index' },
            { label: 'Quickstart', slug: 'getting-started/quickstart' },
            { label: 'Core Concepts', slug: 'getting-started/concepts' },
            { label: 'Architecture', slug: 'getting-started/architecture' },
          ],
        },
        {
          label: 'CLI',
          items: [
            { label: 'Installation', slug: 'cli/installation' },
            { label: 'Authentication', slug: 'cli/authentication' },
            { label: 'Vaults', slug: 'cli/vaults' },
            { label: 'Secrets', slug: 'cli/secrets' },
            { label: 'Environments', slug: 'cli/environments' },
            { label: 'Running Commands', slug: 'cli/run' },
            { label: 'Team Management', slug: 'cli/team' },
            { label: 'Advanced', slug: 'cli/advanced' },
          ],
        },
        {
          label: 'SDK',
          items: [
            { label: 'Installation', slug: 'sdk/installation' },
            { label: 'Authentication', slug: 'sdk/authentication' },
            { label: 'Vaults', slug: 'sdk/vaults' },
            { label: 'Secrets', slug: 'sdk/secrets' },
            { label: 'Environments', slug: 'sdk/environments' },
            { label: 'Advanced', slug: 'sdk/advanced' },
          ],
        },
        {
          label: 'MCP Server',
          items: [
            { label: 'Setup', slug: 'mcp/setup' },
            { label: 'Tools Reference', slug: 'mcp/tools' },
          ],
        },
        {
          label: 'GitHub Action',
          items: [
            { label: 'Usage', slug: 'github-action/usage' },
          ],
        },
        {
          label: 'Self-Hosting',
          items: [
            { label: 'Docker', slug: 'self-hosting/docker' },
            { label: 'Manual Setup', slug: 'self-hosting/manual' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'REST API', slug: 'reference/api' },
            { label: 'Encryption', slug: 'reference/encryption' },
            { label: 'Plans & Limits', slug: 'reference/plans' },
          ],
        },
        { label: 'Security', slug: 'security' },
      ],
    }),
  ],
});
