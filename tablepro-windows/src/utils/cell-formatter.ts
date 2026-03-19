export type CellType = 'text' | 'number' | 'boolean' | 'date' | 'json' | 'uuid' | 'null';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ISO 8601: date, datetime, datetime+tz variants
const ISO_DATE_REGEX =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;

const NUMBER_REGEX = /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/;

export function detectCellType(value: string | null, columnType?: string): CellType {
  if (value === null) return 'null';

  // Use column type hint first
  if (columnType) {
    const lower = columnType.toLowerCase();
    if (lower.includes('json') || lower.includes('jsonb')) return 'json';
    if (lower.includes('uuid')) return 'uuid';
    if (
      lower.includes('timestamp') ||
      lower.includes('datetime') ||
      lower === 'date' ||
      lower === 'time'
    )
      return 'date';
    if (lower === 'bool' || lower === 'boolean') return 'boolean';
    if (
      lower.includes('int') ||
      lower.includes('numeric') ||
      lower.includes('decimal') ||
      lower.includes('float') ||
      lower.includes('double') ||
      lower.includes('real')
    )
      return 'number';
  }

  // Value-based detection (no hint or hint was unrecognized)
  if (UUID_REGEX.test(value)) return 'uuid';

  if (ISO_DATE_REGEX.test(value)) return 'date';

  if (value === 'true' || value === 'false' || value === 't' || value === 'f') return 'boolean';

  if ((value.startsWith('{') || value.startsWith('[')) && value.length > 1) {
    try {
      JSON.parse(value);
      return 'json';
    } catch {
      // not valid JSON
    }
  }

  if (NUMBER_REGEX.test(value)) return 'number';

  return 'text';
}

/** Plain text representation — used for copy/export, not rendering */
export function formatCellValue(value: string | null, type: CellType): string {
  if (type === 'null' || value === null) return '';

  if (type === 'date') {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleString();
  }

  if (type === 'boolean') {
    const lower = value.toLowerCase();
    if (lower === 'true' || lower === 't') return 'true';
    if (lower === 'false' || lower === 'f') return 'false';
  }

  return value;
}

/** Summarise a JSON value for compact cell display */
export function summarizeJson(value: string): string {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return `[${parsed.length} item${parsed.length !== 1 ? 's' : ''}]`;
    if (parsed !== null && typeof parsed === 'object') {
      const keys = Object.keys(parsed as object).length;
      return `{${keys} key${keys !== 1 ? 's' : ''}}`;
    }
    return value;
  } catch {
    return value;
  }
}

/** Return relative time string, e.g. "3 days ago" */
export function relativeTime(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';

  const diff = Date.now() - d.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  const month = 30 * day;
  const year = 365 * day;

  let label: string;
  if (abs < minute) label = 'just now';
  else if (abs < hour) label = `${Math.round(abs / minute)}m`;
  else if (abs < day) label = `${Math.round(abs / hour)}h`;
  else if (abs < week) label = `${Math.round(abs / day)}d`;
  else if (abs < month) label = `${Math.round(abs / week)}w`;
  else if (abs < year) label = `${Math.round(abs / month)}mo`;
  else label = `${Math.round(abs / year)}y`;

  if (label === 'just now') return label;
  return future ? `in ${label}` : `${label} ago`;
}
