import { describe, it, expect } from 'vitest';
import { EnvResource } from '../resources/env.js';

// Create a minimal mock to test the parse method directly
function createEnvResource(): EnvResource {
  const mockSecrets = {} as any;
  return new EnvResource(mockSecrets);
}

describe('EnvResource.parse', () => {
  const env = createEnvResource();

  it('parses simple key=value pairs', () => {
    const result = env.parse('FOO=bar\nBAZ=qux');
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips empty lines and comments', () => {
    const result = env.parse(`
# Database config
DB_HOST=localhost

# Port
DB_PORT=5432
    `);
    expect(result).toEqual({ DB_HOST: 'localhost', DB_PORT: '5432' });
  });

  it('handles double-quoted values', () => {
    const result = env.parse('API_KEY="sk-live-xxxxx"');
    expect(result).toEqual({ API_KEY: 'sk-live-xxxxx' });
  });

  it('handles single-quoted values', () => {
    const result = env.parse("SECRET='my-secret'");
    expect(result).toEqual({ SECRET: 'my-secret' });
  });

  it('handles values with equals signs', () => {
    const result = env.parse('DATABASE_URL=postgres://user:pass@host/db?sslmode=require');
    expect(result).toEqual({
      DATABASE_URL: 'postgres://user:pass@host/db?sslmode=require',
    });
  });

  it('handles empty values', () => {
    const result = env.parse('EMPTY=');
    expect(result).toEqual({ EMPTY: '' });
  });

  it('trims whitespace around keys and values', () => {
    const result = env.parse('  KEY  =  value  ');
    expect(result).toEqual({ KEY: 'value' });
  });

  it('skips lines without equals sign', () => {
    const result = env.parse('INVALID_LINE\nVALID=yes');
    expect(result).toEqual({ VALID: 'yes' });
  });

  it('handles empty input', () => {
    const result = env.parse('');
    expect(result).toEqual({});
  });

  it('handles complex real-world .env', () => {
    const input = `# App config
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL="postgres://admin:p@ss=word@db.example.com:5432/mydb"

# API Keys
STRIPE_KEY=sk_live_abcdefg
OPENAI_KEY='sk-proj-xxxxx'

# Empty
DEBUG=
`;
    const result = env.parse(input);
    expect(result).toEqual({
      NODE_ENV: 'production',
      PORT: '3000',
      DATABASE_URL: 'postgres://admin:p@ss=word@db.example.com:5432/mydb',
      STRIPE_KEY: 'sk_live_abcdefg',
      OPENAI_KEY: 'sk-proj-xxxxx',
      DEBUG: '',
    });
  });
});
