import { describe, it, expect } from "vitest";
import { formatConnectionUri } from "./connection-card";
import type { SavedConnection, ConnectionConfig } from "../../types/connection";

function makeConn(overrides: Partial<ConnectionConfig> = {}): SavedConnection {
  return {
    id: "1",
    name: "Test",
    config: {
      host: "localhost",
      port: 5432,
      user: "admin",
      password: "secret",
      database: "mydb",
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
      ...overrides,
    },
  };
}

describe("formatConnectionUri", () => {
  it("formats host:port · database", () => {
    expect(formatConnectionUri(makeConn())).toBe("localhost:5432 · mydb");
  });

  it("formats host:port when database is empty", () => {
    expect(formatConnectionUri(makeConn({ database: "" }))).toBe("localhost:5432");
  });

  it("omits port when port is 0", () => {
    expect(formatConnectionUri(makeConn({ port: 0 }))).toBe("localhost · mydb");
  });

  it("omits port when port is 0 and no database", () => {
    expect(formatConnectionUri(makeConn({ port: 0, database: "" }))).toBe("localhost");
  });

  it("formats sqlite as database path or fallback", () => {
    const conn = makeConn({ dbType: "sqlite", database: "/path/to/data.db" });
    expect(formatConnectionUri(conn)).toBe("/path/to/data.db");
  });

  it("sqlite with empty database shows fallback", () => {
    const conn = makeConn({ dbType: "sqlite", database: "" });
    expect(formatConnectionUri(conn)).toBe("SQLite database");
  });

  it("handles custom port", () => {
    expect(formatConnectionUri(makeConn({ port: 3306 }))).toBe("localhost:3306 · mydb");
  });

  it("handles remote host", () => {
    expect(formatConnectionUri(makeConn({ host: "db.example.com" }))).toBe(
      "db.example.com:5432 · mydb",
    );
  });
});
