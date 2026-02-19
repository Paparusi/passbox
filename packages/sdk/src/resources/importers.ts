import type { SecretsResource } from './secrets.js';
import type { EnvResource } from './env.js';

export interface ImportResult {
  created: number;
  updated: number;
  errors: string[];
}

export interface ImportOptions {
  vault?: string;
  env?: string;
}

export class ImportersResource {
  constructor(
    private secrets: SecretsResource,
    private envResource: EnvResource,
  ) {}

  /**
   * Import from .env file content.
   */
  async fromDotenv(content: string, options?: ImportOptions): Promise<ImportResult> {
    const entries = this.envResource.parse(content);
    return this.importEntries(entries, options);
  }

  /**
   * Import from JSON content.
   * Supports: {"KEY": "value", ...} or [{"name": "KEY", "value": "value", "description": "..."}]
   */
  async fromJSON(content: string, options?: ImportOptions): Promise<ImportResult> {
    const parsed = JSON.parse(content);
    let entries: Record<string, string>;

    if (Array.isArray(parsed)) {
      // Array format: [{name, value, description?}]
      entries = {};
      for (const item of parsed) {
        if (item.name && item.value !== undefined) {
          entries[item.name] = String(item.value);
        }
      }
    } else if (typeof parsed === 'object' && parsed !== null) {
      // Object format: {KEY: "value"}
      entries = {};
      for (const [key, value] of Object.entries(parsed)) {
        entries[key] = String(value);
      }
    } else {
      throw new Error('Invalid JSON format. Expected object or array.');
    }

    return this.importEntries(entries, options);
  }

  /**
   * Import from CSV content.
   * Expected format: name,value[,description] with header row.
   */
  async fromCSV(content: string, options?: ImportOptions): Promise<ImportResult> {
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

    // Parse header
    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const nameIdx = header.indexOf('name');
    const valueIdx = header.indexOf('value');

    if (nameIdx === -1 || valueIdx === -1) {
      throw new Error('CSV must have "name" and "value" columns');
    }

    const entries: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = this.parseCSVLine(lines[i]);
      const name = cols[nameIdx]?.trim();
      const value = cols[valueIdx]?.trim();
      if (name && value !== undefined) {
        entries[name] = value;
      }
    }

    return this.importEntries(entries, options);
  }

  /**
   * Auto-detect format and import.
   */
  async autoImport(content: string, filename?: string, options?: ImportOptions): Promise<ImportResult> {
    const ext = filename?.split('.').pop()?.toLowerCase();

    if (ext === 'json') return this.fromJSON(content, options);
    if (ext === 'csv') return this.fromCSV(content, options);

    // Try to detect format
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return this.fromJSON(content, options);
    }
    if (trimmed.includes(',') && trimmed.split('\n')[0].toLowerCase().includes('name')) {
      return this.fromCSV(content, options);
    }

    // Default to .env format
    return this.fromDotenv(content, options);
  }

  private async importEntries(entries: Record<string, string>, options?: ImportOptions): Promise<ImportResult> {
    const results: ImportResult = { created: 0, updated: 0, errors: [] };

    for (const [name, value] of Object.entries(entries)) {
      try {
        await this.secrets.set(name, value, { vault: options?.vault, env: options?.env });
        results.created++;
      } catch (err: any) {
        results.errors.push(`${name}: ${err.message}`);
      }
    }

    return results;
  }

  private parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }
}
