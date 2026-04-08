import { useConnectionStore } from '../stores/connectionStore';
import type { ConnectionConfig } from '../types/connection';

const ALLOWED_EXTENSIONS = ['.sqlite', '.sqlite3', '.db'];

function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

function hasAllowedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return ALLOWED_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export async function handleFileOpen(filePath: string): Promise<void> {
  if (!filePath || !hasAllowedExtension(filePath)) {
    console.warn('[file-open] Rejected file path:', filePath);
    return;
  }

  const _fileName = getFileName(filePath);

  const config: ConnectionConfig = {
    host: '',
    port: 0,
    user: '',
    password: '',
    database: filePath,
    dbType: 'sqlite',
    sslMode: '',
    sshEnabled: false,
    sshHost: '',
    sshPort: 22,
    sshUser: '',
    sshAuthMethod: 'password',
    sshPassword: '',
    sshKeyPath: '',
    sshKeyPassphrase: '',
  };

  // Use the file path as a stable ephemeral ID so re-opening the same file
  // reuses the connection entry instead of creating duplicates.
  const ephemeralId = `file:${filePath}`;

  const store = useConnectionStore.getState();
  try {
    await store.connect(ephemeralId, config);
  } catch (err) {
    console.error('[file-open] Failed to connect to SQLite database:', err);
  }
}
