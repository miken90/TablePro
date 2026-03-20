import type { ColumnInfo } from "../types/query";

const NUMERIC_TYPES = new Set([
  "int", "integer", "int2", "int4", "int8", "int16",
  "bigint", "smallint", "tinyint", "mediumint",
  "serial", "bigserial", "smallserial",
  "numeric", "decimal", "float", "float4", "float8",
  "double", "double precision", "real", "money",
  "number",
]);

const BOOL_TYPES = new Set(["bool", "boolean"]);

const JSON_TYPES = new Set(["json", "jsonb"]);

const BINARY_TYPES = new Set(["bytea", "blob", "binary", "varbinary", "image", "longblob", "mediumblob", "tinyblob"]);

function normalizeType(typeName: string): string {
  return typeName.toLowerCase().replace(/\(.*\)/, "").trim();
}

function isNumericType(typeName: string): boolean {
  const t = normalizeType(typeName);
  for (const nt of NUMERIC_TYPES) {
    if (t === nt || t.startsWith(`${nt} `)) return true;
  }
  return false;
}

function isBoolType(typeName: string): boolean {
  return BOOL_TYPES.has(normalizeType(typeName));
}

function isJsonType(typeName: string): boolean {
  return JSON_TYPES.has(normalizeType(typeName));
}

function isBinaryType(typeName: string): boolean {
  const t = normalizeType(typeName);
  return BINARY_TYPES.has(t);
}

function coerceValue(val: string | null, typeName: string): unknown {
  if (val === null) return null;

  if (isBinaryType(typeName)) {
    return `<binary, ${val.length} bytes>`;
  }

  if (isJsonType(typeName)) {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }

  if (isBoolType(typeName)) {
    const lower = val.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "t" || lower === "yes") return true;
    if (lower === "false" || lower === "0" || lower === "f" || lower === "no") return false;
    return val;
  }

  if (isNumericType(typeName)) {
    const n = Number(val);
    if (!Number.isNaN(n) && val.trim() !== "") return n;
  }

  return val;
}

export function rowToJson(
  columns: ColumnInfo[],
  row: (string | null)[],
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < columns.length; i++) {
    const col = columns[i];
    obj[col.name] = coerceValue(row[i] ?? null, col.typeName);
  }
  return obj;
}
