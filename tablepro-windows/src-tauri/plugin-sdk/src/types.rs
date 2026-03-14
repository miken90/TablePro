/// Borrowed string slice passed TO the plugin — plugin must not free it.
/// The plugin must not store the pointer beyond the call duration.
#[repr(C)]
pub struct FfiStr {
    pub ptr: *const u8,
    pub len: usize,
}

impl FfiStr {
    /// # Safety
    /// Caller guarantees ptr+len is valid UTF-8 for the lifetime of the call.
    pub unsafe fn as_str(&self) -> &str {
        if self.ptr.is_null() || self.len == 0 {
            return "";
        }
        let bytes = std::slice::from_raw_parts(self.ptr, self.len);
        std::str::from_utf8_unchecked(bytes)
    }
}

impl From<&str> for FfiStr {
    fn from(s: &str) -> Self {
        FfiStr {
            ptr: s.as_ptr(),
            len: s.len(),
        }
    }
}

// SAFETY: FfiStr is a borrowed reference — it must not outlive the call.
// We only use it as a temporary argument, never stored across threads.
unsafe impl Send for FfiStr {}
unsafe impl Sync for FfiStr {}

/// Owned string allocated by the plugin — host must call the paired free function.
#[repr(C)]
pub struct FfiString {
    pub ptr: *mut u8,
    pub len: usize,
    pub capacity: usize,
}

impl FfiString {
    pub fn null() -> Self {
        FfiString {
            ptr: std::ptr::null_mut(),
            len: 0,
            capacity: 0,
        }
    }

    pub fn is_null(&self) -> bool {
        self.ptr.is_null()
    }

    /// Copy the bytes into a Rust String without freeing. Caller must free separately.
    /// # Safety
    /// ptr must be valid UTF-8 with length `len`.
    pub unsafe fn to_string_copy(&self) -> String {
        if self.ptr.is_null() || self.len == 0 {
            return String::new();
        }
        let bytes = std::slice::from_raw_parts(self.ptr, self.len);
        String::from_utf8_lossy(bytes).into_owned()
    }
}

unsafe impl Send for FfiString {}
unsafe impl Sync for FfiString {}

/// Generic success/error result returned from plugin calls.
#[repr(C)]
pub struct FfiResult {
    pub success: bool,
    pub error: FfiString,
}

/// Column metadata returned from the plugin.
#[repr(C)]
pub struct FfiColumnInfo {
    pub name: FfiString,
    pub type_name: FfiString,
    pub nullable: bool,
    pub is_primary_key: bool,
}

/// Full query result set.
#[repr(C)]
pub struct FfiQueryResult {
    /// Flat array: rows * columns elements, row-major order.
    pub columns: *mut FfiColumnInfo,
    pub column_count: usize,
    /// Flat array of FfiString: row_count * column_count elements.
    pub cells: *mut FfiString,
    pub row_count: usize,
    pub affected_rows: i64,
    pub error: FfiString,
}

unsafe impl Send for FfiQueryResult {}
unsafe impl Sync for FfiQueryResult {}

/// Table descriptor.
#[repr(C)]
pub struct FfiTableInfo {
    pub name: FfiString,
    pub schema: FfiString,
    pub table_type: FfiString,
    pub row_count_estimate: i64,
    pub has_row_count: bool,
}

/// List of table descriptors.
#[repr(C)]
pub struct FfiTableList {
    pub items: *mut FfiTableInfo,
    pub count: usize,
    pub error: FfiString,
}

unsafe impl Send for FfiTableList {}
unsafe impl Sync for FfiTableList {}

/// List of column descriptors.
#[repr(C)]
pub struct FfiColumnList {
    pub items: *mut FfiColumnInfo,
    pub count: usize,
    pub error: FfiString,
}

unsafe impl Send for FfiColumnList {}
unsafe impl Sync for FfiColumnList {}

/// Index descriptor.
#[repr(C)]
pub struct FfiIndexInfo {
    pub name: FfiString,
    pub columns: *mut FfiString,
    pub column_count: usize,
    pub is_unique: bool,
    pub index_type: FfiString,
}

/// List of index descriptors.
#[repr(C)]
pub struct FfiIndexList {
    pub items: *mut FfiIndexInfo,
    pub count: usize,
    pub error: FfiString,
}

unsafe impl Send for FfiIndexList {}
unsafe impl Sync for FfiIndexList {}

/// Foreign key descriptor.
#[repr(C)]
pub struct FfiForeignKeyInfo {
    pub name: FfiString,
    pub column: FfiString,
    pub referenced_table: FfiString,
    pub referenced_column: FfiString,
}

/// List of foreign key descriptors.
#[repr(C)]
pub struct FfiForeignKeyList {
    pub items: *mut FfiForeignKeyInfo,
    pub count: usize,
    pub error: FfiString,
}

unsafe impl Send for FfiForeignKeyList {}
unsafe impl Sync for FfiForeignKeyList {}

/// List of plain strings (e.g. database names).
#[repr(C)]
pub struct FfiStringList {
    pub items: *mut FfiString,
    pub count: usize,
    pub error: FfiString,
}

unsafe impl Send for FfiStringList {}
unsafe impl Sync for FfiStringList {}

/// Connection configuration passed to the plugin when creating a driver instance.
#[repr(C)]
pub struct DriverConfig {
    pub host: FfiStr,
    pub port: u16,
    pub user: FfiStr,
    pub password: FfiStr,
    pub database: FfiStr,
    pub ssl_mode: FfiStr,
}

unsafe impl Send for DriverConfig {}
unsafe impl Sync for DriverConfig {}

/// Opaque handle to a driver instance — the plugin owns the memory.
#[repr(C)]
pub struct DriverHandle {
    _private: [u8; 0],
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ffi_str_from_str() {
        let s = "hello";
        let ffi: FfiStr = s.into();
        assert_eq!(ffi.len, 5);
        assert!(!ffi.ptr.is_null());
    }

    #[test]
    fn test_ffi_str_as_str_round_trip() {
        let s = "test_value";
        let ffi: FfiStr = s.into();
        let result = unsafe { ffi.as_str() };
        assert_eq!(result, "test_value");
    }

    #[test]
    fn test_ffi_str_empty_string() {
        let s = "";
        let ffi: FfiStr = s.into();
        let result = unsafe { ffi.as_str() };
        assert_eq!(result, "");
    }

    #[test]
    fn test_ffi_string_null() {
        let s = FfiString::null();
        assert!(s.is_null());
        assert!(s.ptr.is_null());
        assert_eq!(s.len, 0);
        assert_eq!(s.capacity, 0);
    }

    #[test]
    fn test_ffi_string_null_to_string_copy() {
        let s = FfiString::null();
        let result = unsafe { s.to_string_copy() };
        assert_eq!(result, "");
    }

    #[test]
    fn test_ffi_result_success_field() {
        let r = FfiResult {
            success: true,
            error: FfiString::null(),
        };
        assert!(r.success);
    }

    #[test]
    fn test_ffi_result_failure_field() {
        let r = FfiResult {
            success: false,
            error: FfiString::null(),
        };
        assert!(!r.success);
    }
}
