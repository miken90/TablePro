import { describe, it, expect } from "vitest";
import { filterConnections } from "./connection-filter";
import type { SavedConnection, ConnectionConfig } from "../../types/connection";

function makeConn(
  name: string,
  overrides: Partial<ConnectionConfig & { tag?: string; groupId?: string }> = {},
): SavedConnection {
  const { tag, groupId, ...configOverrides } = overrides;
  return {
    id: crypto.randomUUID(),
    name,
    tag,
    groupId,
    config: {
      host: "localhost",
      port: 5432,
      user: "admin",
      password: "",
      database: "testdb",
      dbType: "postgres",
      sslMode: "disable",
      sshEnabled: false,
      sshHost: "",
      sshPort: 22,
      sshUser: "",
      sshAuthMethod: "password",
      sshPassword: "",
      sshKeyPath: "",
      sshKeyPassphrase: "",
      ...configOverrides,
    },
  };
}

const connections = [
  makeConn("Production PG", { host: "pg.prod.example.com", database: "appdb", tag: "production" }),
  makeConn("Staging MySQL", { host: "mysql.staging.local", database: "staging_db", dbType: "mysql", tag: "staging" }),
  makeConn("Local SQLite", { host: "", database: "/tmp/dev.db", dbType: "sqlite" }),
  makeConn("Dev Redis", { host: "127.0.0.1", port: 6379, database: "", dbType: "redis", tag: "development" }),
];

describe("filterConnections", () => {
  it("returns all connections for empty query", () => {
    expect(filterConnections(connections, "")).toEqual(connections);
  });

  it("returns all connections for whitespace-only query", () => {
    expect(filterConnections(connections, "   ")).toEqual(connections);
  });

  it("filters by connection name", () => {
    const result = filterConnections(connections, "Production");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Production PG");
  });

  it("filters by host", () => {
    const result = filterConnections(connections, "staging.local");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Staging MySQL");
  });

  it("filters by database name", () => {
    const result = filterConnections(connections, "appdb");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Production PG");
  });

  it("filters by engine label (PostgreSQL)", () => {
    const result = filterConnections(connections, "PostgreSQL");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Production PG");
  });

  it("filters by engine label (MySQL)", () => {
    const result = filterConnections(connections, "MySQL");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Staging MySQL");
  });

  it("filters by tag", () => {
    const result = filterConnections(connections, "staging");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Staging MySQL");
  });

  it("is case-insensitive", () => {
    const result = filterConnections(connections, "PRODUCTION");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Production PG");
  });

  it("returns empty array when nothing matches", () => {
    expect(filterConnections(connections, "mongodb")).toHaveLength(0);
  });

  it("handles connections without tag", () => {
    const result = filterConnections(connections, "SQLite");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Local SQLite");
  });

  it("matches partial strings", () => {
    const result = filterConnections(connections, "Stag");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("Staging MySQL");
  });

  it("returns multiple matches", () => {
    // "local" matches "Local SQLite" name and "mysql.staging.local" host
    const result = filterConnections(connections, "local");
    expect(result).toHaveLength(2);
  });

  it("returns empty for empty connection list", () => {
    expect(filterConnections([], "postgres")).toHaveLength(0);
  });
});
