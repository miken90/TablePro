/// Current API version — plugins must match this at load time.
pub const API_VERSION: u32 = 1;

pub mod types;
pub mod vtable;

pub use types::{
    DriverConfig, DriverHandle, FfiColumnInfo, FfiColumnList, FfiForeignKeyInfo,
    FfiForeignKeyList, FfiIndexInfo, FfiIndexList, FfiQueryResult, FfiResult, FfiStr, FfiString,
    FfiStringList, FfiTableInfo, FfiTableList,
};
pub use vtable::{PluginMetadata, PluginVTable};
