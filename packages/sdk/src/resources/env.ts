import type { SecretsResource } from './secrets.js';

export interface EnvImportOptions {
  vault?: string;
}

export class EnvResource {
  constructor(private secrets: SecretsResource) {}

  /**
   * Parse a .env string into key-value pairs.
   */
  parse(envContent: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = envContent.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const eqIndex = trimmed.indexOf('=');
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      result[key] = value;
    }

    return result;
  }

  /**
   * Import a .env string into a vault.
   */
  async import(envContent: string, options?: EnvImportOptions): Promise<{ created: number; updated: number }> {
    const entries = this.parse(envContent);
    let created = 0;
    let updated = 0;

    for (const [name, value] of Object.entries(entries)) {
      try {
        await this.secrets.set(name, value, { vault: options?.vault });
        created++;
      } catch {
        updated++;
      }
    }

    return { created, updated };
  }

  /**
   * Export all secrets from a vault as a .env string.
   */
  async export(options?: EnvImportOptions): Promise<string> {
    const all = await this.secrets.getAll({ vault: options?.vault });

    return Object.entries(all)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => {
        // Quote values with special characters
        if (value.includes(' ') || value.includes('#') || value.includes('\n')) {
          return `${key}="${value.replace(/"/g, '\\"')}"`;
        }
        return `${key}=${value}`;
      })
      .join('\n');
  }

  /**
   * Inject all secrets into process.env.
   */
  async inject(options?: EnvImportOptions): Promise<void> {
    const all = await this.secrets.getAll({ vault: options?.vault });
    for (const [key, value] of Object.entries(all)) {
      process.env[key] = value;
    }
  }
}
