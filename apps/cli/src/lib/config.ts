import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

const CONFIG_DIR = path.join(os.homedir(), '.passbox');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const AUTH_FILE = path.join(CONFIG_DIR, 'auth.json');
const PROJECT_FILE = '.passbox.json';

export interface GlobalConfig {
  server: string;
  defaultVault?: string;
}

export interface AuthData {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  email: string;
  masterKeyEncrypted?: string; // Encrypted master key for session persistence
}

export interface ProjectConfig {
  vault?: string;
  server?: string;
}

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

// ─── Global Config ─────────────────────────────────
export function getConfig(): GlobalConfig {
  ensureConfigDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { server: 'https://api.passbox.dev' };
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

export function setConfig(config: Partial<GlobalConfig>) {
  ensureConfigDir();
  const current = getConfig();
  const updated = { ...current, ...config };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));
}

// ─── Auth ──────────────────────────────────────────
export function getAuth(): AuthData | null {
  ensureConfigDir();
  if (!fs.existsSync(AUTH_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveAuth(auth: AuthData) {
  ensureConfigDir();
  fs.writeFileSync(AUTH_FILE, JSON.stringify(auth, null, 2), { mode: 0o600 });
}

export function clearAuth() {
  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
  }
}

// ─── Project Config ────────────────────────────────
export function getProjectConfig(): ProjectConfig | null {
  const filePath = path.resolve(PROJECT_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

export function saveProjectConfig(config: ProjectConfig) {
  fs.writeFileSync(
    path.resolve(PROJECT_FILE),
    JSON.stringify(config, null, 2),
  );
}

export function getServerUrl(): string {
  const project = getProjectConfig();
  if (project?.server) return project.server;
  return getConfig().server;
}

export function getDefaultVault(): string | undefined {
  const project = getProjectConfig();
  if (project?.vault) return project.vault;
  return getConfig().defaultVault;
}
