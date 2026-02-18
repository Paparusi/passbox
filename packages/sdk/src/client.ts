import type { ApiResponse } from '@passbox/types';

export interface ClientConfig {
  serverUrl: string;
  token?: string;
  accessToken?: string;
}

export class HttpClient {
  private baseUrl: string;
  private token?: string;
  private accessToken?: string;

  constructor(config: ClientConfig) {
    this.baseUrl = config.serverUrl.replace(/\/$/, '') + '/api/v1';
    this.token = config.token;
    this.accessToken = config.accessToken;
  }

  setAccessToken(token: string) {
    this.accessToken = token;
  }

  private getAuthHeader(): string {
    const token = this.token || this.accessToken;
    if (!token) throw new Error('No authentication token configured');
    return `Bearer ${token}`;
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return this.handleResponse<T>(res);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async delete<T>(path: string): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers: {
        'Authorization': this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
    });
    return this.handleResponse<T>(res);
  }

  // Public unauthenticated requests (login, register)
  async publicPost<T>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const json = (await res.json()) as ApiResponse<T>;

    if (!res.ok || !json.success) {
      const msg = json.error?.message || `HTTP ${res.status}`;
      const err = new Error(msg) as Error & { code?: string; statusCode?: number };
      err.code = json.error?.code;
      err.statusCode = res.status;
      throw err;
    }

    return json.data as T;
  }
}
