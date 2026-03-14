/// FFI helper utilities shared across the MSSQL driver modules.
use tablepro_plugin_sdk::{FfiResult, FfiString};

/// Move a `String` into an `FfiString` (plugin owns the allocation).
pub fn string_to_ffi(s: String) -> FfiString {
    let mut bytes = s.into_bytes();
    let ptr = bytes.as_mut_ptr();
    let len = bytes.len();
    let cap = bytes.capacity();
    std::mem::forget(bytes);
    FfiString {
        ptr,
        len,
        capacity: cap,
    }
}

/// Build a success `FfiResult`.
pub fn ok_result() -> FfiResult {
    FfiResult {
        success: true,
        error: FfiString::null(),
    }
}

/// Build an error `FfiResult` from a message string.
pub fn err_result(msg: impl Into<String>) -> FfiResult {
    FfiResult {
        success: false,
        error: string_to_ffi(msg.into()),
    }
}

/// Reconstitute and drop an `FfiString` allocation.
///
/// # Safety
/// `s` must have been allocated by `string_to_ffi` in this same plugin.
pub unsafe fn drop_ffi_string(s: FfiString) {
    if !s.ptr.is_null() {
        let _ = Vec::from_raw_parts(s.ptr, s.len, s.capacity);
    }
}
