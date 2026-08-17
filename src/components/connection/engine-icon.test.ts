import { describe, it, expect } from "vitest";
import { engineLabel } from "./engine-icon";

describe("engineLabel", () => {
  it("returns PostgreSQL for postgres", () => {
    expect(engineLabel("postgres")).toBe("PostgreSQL");
  });

  it("returns PostgreSQL for postgresql alias", () => {
    expect(engineLabel("postgresql")).toBe("PostgreSQL");
  });

  it("returns MySQL for mysql", () => {
    expect(engineLabel("mysql")).toBe("MySQL");
  });

  it("returns MariaDB for mariadb", () => {
    expect(engineLabel("mariadb")).toBe("MariaDB");
  });

  it("returns SQL Server for mssql", () => {
    expect(engineLabel("mssql")).toBe("SQL Server");
  });

  it("returns SQL Server for sqlserver alias", () => {
    expect(engineLabel("sqlserver")).toBe("SQL Server");
  });

  it("returns SQLite for sqlite", () => {
    expect(engineLabel("sqlite")).toBe("SQLite");
  });

  it("returns Redis for redis", () => {
    expect(engineLabel("redis")).toBe("Redis");
  });

  it("returns Oracle for oracle", () => {
    expect(engineLabel("oracle")).toBe("Oracle");
  });

  it("returns ClickHouse for clickhouse", () => {
    expect(engineLabel("clickhouse")).toBe("ClickHouse");
  });

  it("returns DuckDB for duckdb", () => {
    expect(engineLabel("duckdb")).toBe("DuckDB");
  });

  it("is case-insensitive", () => {
    expect(engineLabel("POSTGRES")).toBe("PostgreSQL");
    expect(engineLabel("MySQL")).toBe("MySQL");
    expect(engineLabel("MSSQL")).toBe("SQL Server");
  });

  it("returns raw dbType for unknown engines", () => {
    expect(engineLabel("cockroachdb")).toBe("cockroachdb");
    expect(engineLabel("unknown")).toBe("unknown");
  });
});
