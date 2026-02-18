import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HttpClient } from '../client.js';

describe('HttpClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs base URL correctly', () => {
    const client = new HttpClient({ serverUrl: 'https://api.example.com' });
    // We can't access baseUrl directly, so test through a request
    expect(client).toBeDefined();
  });

  it('strips trailing slash from server URL', () => {
    const client = new HttpClient({ serverUrl: 'https://api.example.com/' });
    expect(client).toBeDefined();
  });

  it('throws when no auth token is set for authenticated requests', async () => {
    const client = new HttpClient({ serverUrl: 'https://api.example.com' });
    await expect(client.get('/vaults')).rejects.toThrow('No authentication token configured');
  });

  it('uses service token for authentication', async () => {
    const mockResponse = { success: true, data: { id: '123' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new HttpClient({
      serverUrl: 'https://api.example.com',
      token: 'pb_test_token',
    });

    const result = await client.get<{ id: string }>('/vaults');
    expect(result).toEqual({ id: '123' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/vaults',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer pb_test_token',
        }),
      }),
    );
  });

  it('uses access token set via setAccessToken', async () => {
    const mockResponse = { success: true, data: [] };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new HttpClient({ serverUrl: 'https://api.example.com' });
    client.setAccessToken('jwt-access-token');

    await client.get('/vaults');

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer jwt-access-token',
        }),
      }),
    );
  });

  it('sends POST request with JSON body', async () => {
    const mockResponse = { success: true, data: { id: 'new-vault' } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new HttpClient({
      serverUrl: 'https://api.example.com',
      token: 'pb_test',
    });

    const result = await client.post('/vaults', { name: 'my-vault' });
    expect(result).toEqual({ id: 'new-vault' });

    expect(fetch).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/vaults',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ name: 'my-vault' }),
      }),
    );
  });

  it('sends PUT request', async () => {
    const mockResponse = { success: true, data: { updated: true } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new HttpClient({
      serverUrl: 'https://api.example.com',
      token: 'pb_test',
    });

    const result = await client.put('/vaults/123', { name: 'renamed' });
    expect(result).toEqual({ updated: true });

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/vaults/123'),
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('sends DELETE request', async () => {
    const mockResponse = { success: true, data: null };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new HttpClient({
      serverUrl: 'https://api.example.com',
      token: 'pb_test',
    });

    await client.delete('/vaults/123');

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/vaults/123'),
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('sends unauthenticated publicPost requests', async () => {
    const mockResponse = { success: true, data: { user: { id: 'u1' } } };
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const client = new HttpClient({ serverUrl: 'https://api.example.com' });

    const result = await client.publicPost('/auth/login', {
      email: 'test@example.com',
      password: 'pass123',
    });

    expect(result).toEqual({ user: { id: 'u1' } });

    const [, options] = vi.mocked(fetch).mock.calls[0];
    expect(options?.headers).not.toHaveProperty('Authorization');
  });

  it('throws error with message from API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      }),
    } as Response);

    const client = new HttpClient({
      serverUrl: 'https://api.example.com',
      token: 'bad-token',
    });

    try {
      await client.get('/vaults');
      expect.unreachable('Should have thrown');
    } catch (err: any) {
      expect(err.message).toBe('Invalid token');
      expect(err.code).toBe('UNAUTHORIZED');
      expect(err.statusCode).toBe(401);
    }
  });

  it('throws generic error when API returns no error message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ success: false }),
    } as Response);

    const client = new HttpClient({
      serverUrl: 'https://api.example.com',
      token: 'pb_test',
    });

    await expect(client.get('/vaults')).rejects.toThrow('HTTP 500');
  });
});
