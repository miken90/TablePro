export type ErrorCategory = 'network' | 'auth' | 'query' | 'ssh' | 'config' | 'system';
export type ErrorAction = 'reconnect' | 'edit-connection' | 'check-syntax' | 'retry';

export interface ErrorContext {
  operation?: 'connect' | 'query' | 'schema' | 'import' | 'export';
  dbType?: string;
  host?: string;
  sshEnabled?: boolean;
}

export interface ErrorPattern {
  pattern: RegExp;
  category: ErrorCategory;
  hint: string;
  recoverable: boolean;
  action?: ErrorAction;
}

/** Fallback hints and recovery per category. */
export const CATEGORY_DEFAULTS: Record<ErrorCategory, { hint: string; recoverable: boolean; action?: ErrorAction }> = {
  network: { hint: 'Check network connection', recoverable: true, action: 'reconnect' },
  auth: { hint: 'Verify credentials', recoverable: false, action: 'edit-connection' },
  query: { hint: 'Check SQL syntax', recoverable: false, action: 'check-syntax' },
  ssh: { hint: 'Check SSH settings', recoverable: false, action: 'edit-connection' },
  config: { hint: 'Check connection settings', recoverable: false, action: 'edit-connection' },
  system: { hint: 'Restart application', recoverable: false },
};

// --- Patterns by category ---

const SSH_PATTERNS: ErrorPattern[] = [
  { pattern: /ssh.*auth(entication)?\s*(failed|denied|rejected)|publickey.*denied|key.*rejected/i, category: 'ssh', hint: 'SSH authentication failed. Check your SSH key or password', recoverable: false, action: 'edit-connection' },
  { pattern: /ssh.*handshake|key exchange failed|kex.*fail/i, category: 'ssh', hint: 'SSH handshake failed. The server may use an unsupported algorithm', recoverable: false },
  { pattern: /channel\s*open.*fail|session.*channel.*refused/i, category: 'ssh', hint: 'SSH channel could not be opened', recoverable: false },
  { pattern: /port\s*forward|tunnel.*fail|local.*forward.*refused/i, category: 'ssh', hint: 'SSH port forwarding failed. Check if the remote port is accessible', recoverable: true, action: 'retry' },
  { pattern: /host\s*key.*verif|known_hosts|fingerprint.*mismatch/i, category: 'ssh', hint: 'SSH host key verification failed', recoverable: false, action: 'edit-connection' },
];

const QUERY_PATTERNS: ErrorPattern[] = [
  { pattern: /syntax error|near "[^"]*"|unexpected token|parse error/i, category: 'query', hint: 'SQL syntax error', recoverable: false, action: 'check-syntax' },
  { pattern: /constraint.*violat|unique.*violat|foreign key.*violat|not.?null.*violat|check.*violat|duplicate entry/i, category: 'query', hint: 'Constraint violation', recoverable: false },
  { pattern: /does not exist|unknown (table|column|function)|no such (table|column)|not found.*relation/i, category: 'query', hint: 'Referenced object does not exist', recoverable: false },
  { pattern: /duplicate key|unique.*constraint|already exists.*key/i, category: 'query', hint: 'Duplicate key value', recoverable: false },
  { pattern: /permission denied|access denied.*to (table|database|schema)|insufficient privileges/i, category: 'query', hint: 'Permission denied. Check database user permissions', recoverable: false, action: 'edit-connection' },
  { pattern: /lock.*time.?out|lock wait timeout/i, category: 'query', hint: 'Lock timeout. Another transaction may be blocking', recoverable: true, action: 'retry' },
  { pattern: /deadlock|victim.*deadlock/i, category: 'query', hint: 'Deadlock detected', recoverable: true, action: 'retry' },
];

const AUTH_PATTERNS: ErrorPattern[] = [
  { pattern: /auth(entication|orization)\s*(failed|denied|error)/i, category: 'auth', hint: 'Check your username and password', recoverable: false, action: 'edit-connection' },
  { pattern: /password/i, category: 'auth', hint: 'Check your password', recoverable: false, action: 'edit-connection' },
  { pattern: /login failed|access denied for user/i, category: 'auth', hint: 'Login failed', recoverable: false, action: 'edit-connection' },
];

const NETWORK_PATTERNS: ErrorPattern[] = [
  { pattern: /connection refused/i, category: 'network', hint: 'Check if the server is running on the correct host and port', recoverable: true, action: 'reconnect' },
  { pattern: /timed?\s*out/i, category: 'network', hint: 'The operation timed out', recoverable: true, action: 'retry' },
  { pattern: /no\s*such\s*(host|address)/i, category: 'network', hint: 'Check hostname', recoverable: true, action: 'reconnect' },
  { pattern: /connection\s*reset|broken\s*pipe|econnreset/i, category: 'network', hint: 'Connection was reset', recoverable: true, action: 'reconnect' },
  { pattern: /network.*unreachable|no route to host/i, category: 'network', hint: 'Network is unreachable', recoverable: true, action: 'reconnect' },
];

const CONFIG_PATTERNS: ErrorPattern[] = [
  { pattern: /not found|unsupported.*driver|unknown.*driver/i, category: 'config', hint: 'Driver or configuration not found', recoverable: false, action: 'edit-connection' },
  { pattern: /invalid.*config|bad.*configuration/i, category: 'config', hint: 'Invalid configuration', recoverable: false, action: 'edit-connection' },
  { pattern: /driver.*not loaded|plugin.*not (found|loaded)|dll.*not found/i, category: 'config', hint: 'Database driver not loaded. Check plugin installation', recoverable: false },
];

/** Merged patterns — SSH first for disambiguation, then query, auth, network, config. */
export const ERROR_PATTERNS: ErrorPattern[] = [
  ...SSH_PATTERNS,
  ...QUERY_PATTERNS,
  ...AUTH_PATTERNS,
  ...NETWORK_PATTERNS,
  ...CONFIG_PATTERNS,
];
