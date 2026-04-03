import { describe, expect, it } from "vitest";
import { parseConnectionUrl } from "../../utils/connection-url-parser";

describe("parseConnectionUrl", () => {
  it("parses mysql url", () => {
    const result = parseConnectionUrl("mysql://root:secret@localhost:3306/shop");
    expect(result).toMatchObject({
      dbType: "mysql",
      host: "localhost",
      port: 3306,
      user: "root",
      password: "secret",
      database: "shop",
    });
  });

  it("parses postgres alias and default port", () => {
    const result = parseConnectionUrl("postgres://admin:pw@db.example.com/prod");
    expect(result).toMatchObject({
      dbType: "postgres",
      host: "db.example.com",
      port: 5432,
      user: "admin",
      password: "pw",
      database: "prod",
    });
  });

  it("parses sqlserver alias with encoded password", () => {
    const result = parseConnectionUrl("sqlserver://sa:p%40ss%3Aword@sql-host:1444/master");
    expect(result).toMatchObject({
      dbType: "mssql",
      host: "sql-host",
      port: 1444,
      user: "sa",
      password: "p@ss:word",
      database: "master",
    });
  });

  it("supports missing database", () => {
    const result = parseConnectionUrl("postgresql://u:p@127.0.0.1");
    expect(result.database).toBe("");
    expect(result.port).toBe(5432);
  });

  it("throws on unsupported protocol", () => {
    expect(() => parseConnectionUrl("oracle://u:p@host/db")).toThrow("Unsupported protocol");
  });

  // MongoDB URL parsing tests
  it("parses mongodb:// url with default port", () => {
    const result = parseConnectionUrl("mongodb://admin:secret@mongo.example.com/mydb");
    expect(result).toMatchObject({
      dbType: "mongodb",
      host: "mongo.example.com",
      port: 27017,
      user: "admin",
      password: "secret",
      database: "mydb",
    });
    expect(result.useSrv).toBe(false);
  });

  it("parses mongodb:// url with explicit port", () => {
    const result = parseConnectionUrl("mongodb://user:pass@localhost:27018/testdb");
    expect(result).toMatchObject({
      dbType: "mongodb",
      host: "localhost",
      port: 27018,
      user: "user",
      password: "pass",
      database: "testdb",
    });
    expect(result.useSrv).toBe(false);
  });

  it("parses mongodb+srv:// url and sets useSrv", () => {
    const result = parseConnectionUrl("mongodb+srv://admin:secret@cluster0.example.com/production");
    expect(result).toMatchObject({
      dbType: "mongodb",
      host: "cluster0.example.com",
      port: 27017,
      user: "admin",
      password: "secret",
      database: "production",
    });
    expect(result.useSrv).toBe(true);
  });

  it("parses mongodb:// url without auth", () => {
    const result = parseConnectionUrl("mongodb://localhost/local");
    expect(result).toMatchObject({
      dbType: "mongodb",
      host: "localhost",
      port: 27017,
      user: "",
      password: "",
      database: "local",
    });
    expect(result.useSrv).toBe(false);
  });
});
