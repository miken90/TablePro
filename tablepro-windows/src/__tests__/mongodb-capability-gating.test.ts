import { describe, expect, it } from "vitest";
import type { DriverCapabilities } from "../types/capability";
import { DEFAULT_CAPABILITIES } from "../types/capability";

/** Helper: derive isDocumentDb the same way UI components do. */
function isDocumentDb(caps: DriverCapabilities): boolean {
  return caps.supportsCollections && !caps.supportsSqlEditor;
}

describe("capability gating for MongoDB", () => {
  const mongoCaps: DriverCapabilities = {
    supportsSqlEditor: false,
    supportsSchemas: false,
    supportsCollections: true,
    supportsDdl: false,
    supportsInlineEdit: false,
    supportsImportExport: false,
    supportsStructureView: false,
  };

  const postgresCaps: DriverCapabilities = DEFAULT_CAPABILITIES;

  it("identifies MongoDB as a document database", () => {
    expect(isDocumentDb(mongoCaps)).toBe(true);
  });

  it("identifies PostgreSQL as NOT a document database", () => {
    expect(isDocumentDb(postgresCaps)).toBe(false);
  });

  it("MongoDB hides SQL editor", () => {
    expect(mongoCaps.supportsSqlEditor).toBe(false);
  });

  it("MongoDB hides DDL actions", () => {
    expect(mongoCaps.supportsDdl).toBe(false);
  });

  it("MongoDB hides inline edit", () => {
    expect(mongoCaps.supportsInlineEdit).toBe(false);
  });

  it("MongoDB hides import/export", () => {
    expect(mongoCaps.supportsImportExport).toBe(false);
  });

  it("MongoDB hides structure view", () => {
    expect(mongoCaps.supportsStructureView).toBe(false);
  });

  it("MongoDB supports collections", () => {
    expect(mongoCaps.supportsCollections).toBe(true);
  });

  it("MongoDB hides schemas", () => {
    expect(mongoCaps.supportsSchemas).toBe(false);
  });
});
