/** Capabilities advertised by a driver via its sidecar JSON file. */
export interface DriverCapabilities {
  supportsSqlEditor: boolean;
  supportsSchemas: boolean;
  supportsCollections: boolean;
  supportsDdl: boolean;
  supportsInlineEdit: boolean;
  supportsImportExport: boolean;
  supportsStructureView: boolean;
  /** Whether the engine can abort an in-flight query server-side. */
  supportsQueryCancellation: boolean;
}

/** Metadata for a loaded driver plugin, returned by list_drivers. */
export interface DriverInfo {
  typeId: string;
  displayName: string;
  defaultPort: number;
  capabilities: DriverCapabilities;
}

/** Default for SQL drivers (matches Rust DriverCapabilities::default).
 *  Cancellation is opt-in: a driver must declare it, otherwise the Cancel
 *  affordance stays hidden rather than doing nothing. */
export const DEFAULT_CAPABILITIES: DriverCapabilities = {
  supportsSqlEditor: true,
  supportsSchemas: true,
  supportsCollections: false,
  supportsDdl: true,
  supportsInlineEdit: true,
  supportsImportExport: true,
  supportsStructureView: true,
  supportsQueryCancellation: false,
};
