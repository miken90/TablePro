import { describe, expect, it } from "vitest";
import {
  DB_TYPES,
  DEFAULT_PORTS,
  DB_PLACEHOLDERS,
  getDbTypes,
  getDefaultPort,
} from "./connection-form-config";
import type { DriverInfo } from "../../types/capability";

describe("connection-form-config MongoDB support", () => {
  it("includes mongodb in DB_TYPES", () => {
    expect(DB_TYPES).toContain("mongodb");
  });

  it("has default port 27017 for mongodb", () => {
    expect(DEFAULT_PORTS.mongodb).toBe(27017);
  });

  it("has placeholder for mongodb", () => {
    expect(DB_PLACEHOLDERS.mongodb).toBeDefined();
    expect(DB_PLACEHOLDERS.mongodb.database).toBe("admin");
  });

  it("getDbTypes returns driver list when drivers are loaded", () => {
    const drivers: DriverInfo[] = [
      {
        typeId: "postgres",
        displayName: "PostgreSQL",
        defaultPort: 5432,
        capabilities: {
          supportsSqlEditor: true,
          supportsSchemas: true,
          supportsCollections: false,
          supportsDdl: true,
          supportsInlineEdit: true,
          supportsImportExport: true,
          supportsStructureView: true,
        },
      },
      {
        typeId: "mongodb",
        displayName: "MongoDB",
        defaultPort: 27017,
        capabilities: {
          supportsSqlEditor: false,
          supportsSchemas: false,
          supportsCollections: true,
          supportsDdl: false,
          supportsInlineEdit: false,
          supportsImportExport: false,
          supportsStructureView: false,
        },
      },
    ];
    const types = getDbTypes(drivers);
    expect(types).toEqual(["postgres", "mongodb"]);
  });

  it("getDefaultPort uses driver metadata for mongodb", () => {
    const drivers: DriverInfo[] = [
      {
        typeId: "mongodb",
        displayName: "MongoDB",
        defaultPort: 27017,
        capabilities: {
          supportsSqlEditor: false,
          supportsSchemas: false,
          supportsCollections: true,
          supportsDdl: false,
          supportsInlineEdit: false,
          supportsImportExport: false,
          supportsStructureView: false,
        },
      },
    ];
    expect(getDefaultPort("mongodb", drivers)).toBe(27017);
  });

  it("getDefaultPort falls back to hardcoded for mongodb when no drivers", () => {
    expect(getDefaultPort("mongodb", null)).toBe(27017);
  });
});
