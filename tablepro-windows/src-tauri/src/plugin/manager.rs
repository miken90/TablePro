use std::collections::HashMap;
use std::mem::MaybeUninit;
use std::path::PathBuf;

use tablepro_plugin_sdk::{PluginVTable, API_VERSION};

use crate::models::{AppError, ConnectionConfig};
use crate::plugin::adapter::PluginDriverAdapter;
use crate::plugin::DatabaseDriver;

/// Metadata describing a loaded plugin.
#[derive(Debug, Clone)]
pub struct PluginMetadataInfo {
    pub type_id: String,
    pub display_name: String,
    pub default_port: u16,
}

/// Holds a loaded DLL and its vtable pointer.
struct LoadedPlugin {
    /// Keep the library alive — dropping it unloads the DLL.
    _library: libloading::Library,
    vtable: *mut PluginVTable,
    metadata: PluginMetadataInfo,
}

// SAFETY: PluginVTable is #[repr(C)] with no non-Send types in practice.
// We synchronise access through &self methods only.
unsafe impl Send for LoadedPlugin {}
unsafe impl Sync for LoadedPlugin {}

/// Discovers, loads, and vends driver instances from plugin DLLs.
pub struct PluginManager {
    plugin_dir: PathBuf,
    plugins: HashMap<String, LoadedPlugin>,
}

impl PluginManager {
    pub fn new(plugin_dir: PathBuf) -> Self {
        Self {
            plugin_dir,
            plugins: HashMap::new(),
        }
    }

    /// Scan `plugin_dir` for `*.dll` files, load each, validate API version.
    ///
    /// Falls back to scanning the executable's own directory for `driver-*.dll`
    /// files — this covers `cargo tauri dev` where DLLs are compiled alongside
    /// the binary rather than into a `plugins/` subdirectory.
    pub fn discover_plugins(&mut self) {
        self.scan_dir(&self.plugin_dir.clone());

        if self.plugins.is_empty() {
            // Fallback: look next to the executable itself (dev builds).
            if let Some(exe_dir) = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            {
                if exe_dir != self.plugin_dir {
                    tracing::info!(
                        "No plugins in {:?}, falling back to exe dir {:?}",
                        self.plugin_dir,
                        exe_dir
                    );
                    self.scan_dir(&exe_dir);
                }
            }
        }

        tracing::info!("Discovered {} plugin(s)", self.plugins.len());
    }

    fn scan_dir(&mut self, dir: &std::path::Path) {
        let entries = match std::fs::read_dir(dir) {
            Ok(e) => e,
            Err(err) => {
                tracing::warn!("Plugin dir unreadable {:?}: {err}", dir);
                return;
            }
        };

        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().and_then(|e| e.to_str()) != Some("dll") {
                continue;
            }
            // In fallback mode, only pick up driver-*.dll to avoid loading
            // unrelated DLLs from the build output directory.
            if dir != self.plugin_dir {
                let name = path.file_stem().and_then(|s| s.to_str()).unwrap_or("");
                if !name.starts_with("driver_") && !name.starts_with("driver-") {
                    continue;
                }
            }
            if let Err(err) = self.load_plugin(&path) {
                tracing::warn!("Failed to load plugin {:?}: {err}", path);
            }
        }
    }

    fn load_plugin(&mut self, path: &std::path::Path) -> Result<(), AppError> {
        // SAFETY: Loading foreign code — errors wrapped in AppError.
        let library = unsafe {
            libloading::Library::new(path)
                .map_err(|e| AppError::PluginError(format!("dlopen {:?}: {e}", path)))?
        };

        // Allocate an uninitialized vtable; the plugin's init fn must fill every field.
        let vtable_ptr: *mut PluginVTable = {
            let b: Box<MaybeUninit<PluginVTable>> = Box::new(MaybeUninit::uninit());
            Box::into_raw(b).cast::<PluginVTable>()
        };

        // Resolve and call `tablepro_plugin_init`.
        type InitFn = unsafe extern "C" fn(vtable: *mut PluginVTable);
        let init_fn: libloading::Symbol<InitFn> = unsafe {
            library.get(b"tablepro_plugin_init\0").map_err(|e| {
                // Reclaim vtable memory before returning error.
                drop(Box::from_raw(
                    vtable_ptr.cast::<MaybeUninit<PluginVTable>>(),
                ));
                AppError::PluginError(format!("missing tablepro_plugin_init in {:?}: {e}", path))
            })?
        };

        unsafe { init_fn(vtable_ptr) };

        let vtable_api = unsafe { (*vtable_ptr).api_version };
        if vtable_api != API_VERSION {
            unsafe {
                drop(Box::from_raw(
                    vtable_ptr.cast::<MaybeUninit<PluginVTable>>(),
                ))
            };
            return Err(AppError::PluginError(format!(
                "API version mismatch in {:?}: plugin={vtable_api} host={API_VERSION}",
                path
            )));
        }

        // Read metadata strings via the vtable (they are plugin-owned FfiStrings).
        // We copy them out immediately so we own them as Rust Strings.
        let (type_id, display_name, default_port) = unsafe {
            let meta_fn: libloading::Symbol<
                unsafe extern "C" fn() -> tablepro_plugin_sdk::PluginMetadata,
            > = library.get(b"tablepro_plugin_metadata\0").map_err(|e| {
                drop(Box::from_raw(
                    vtable_ptr.cast::<MaybeUninit<PluginVTable>>(),
                ));
                AppError::PluginError(format!(
                    "missing tablepro_plugin_metadata in {:?}: {e}",
                    path
                ))
            })?;
            let meta = meta_fn();
            let tid = meta.type_id.to_string_copy();
            let dname = meta.display_name.to_string_copy();
            let port = meta.default_port;
            // Free the metadata strings via vtable
            ((*vtable_ptr).free_string)(meta.type_id);
            ((*vtable_ptr).free_string)(meta.display_name);
            (tid, dname, port)
        };

        let metadata = PluginMetadataInfo {
            type_id: type_id.clone(),
            display_name,
            default_port,
        };

        tracing::info!(type_id = %type_id, "Loaded plugin from {:?}", path);

        self.plugins.insert(
            type_id,
            LoadedPlugin {
                _library: library,
                vtable: vtable_ptr,
                metadata,
            },
        );
        Ok(())
    }

    /// Create a driver instance for the given database type + config.
    pub fn create_driver(
        &self,
        type_id: &str,
        config: &ConnectionConfig,
    ) -> Result<Box<dyn DatabaseDriver>, AppError> {
        let plugin = self.plugins.get(type_id).ok_or_else(|| {
            AppError::PluginError(format!("No plugin loaded for type '{type_id}'"))
        })?;

        let adapter = unsafe { PluginDriverAdapter::new(plugin.vtable, config, type_id) }?;
        Ok(Box::new(adapter))
    }

    /// Return metadata for all successfully loaded plugins.
    pub fn list_plugins(&self) -> Vec<PluginMetadataInfo> {
        self.plugins.values().map(|p| p.metadata.clone()).collect()
    }
}

impl Drop for PluginManager {
    fn drop(&mut self) {
        // Reclaim vtable heap allocations before DLLs are unloaded.
        for (_, plugin) in self.plugins.drain() {
            // SAFETY: vtable_ptr was Box::into_raw'd (as MaybeUninit) in load_plugin,
            // and the plugin's init fn fully initialised it before we stored the pointer.
            unsafe {
                drop(Box::from_raw(
                    plugin.vtable.cast::<MaybeUninit<PluginVTable>>(),
                ));
            }
            // _library drops here, unloading the DLL.
        }
    }
}
