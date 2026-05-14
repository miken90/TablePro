//! Statically-linked driver registry.
//!
//! Each supported database engine is compiled in as an `rlib` crate
//! (`driver-postgres`, `driver-mysql`, ...). The `DriverRegistry` owns
//! per-engine metadata and constructs concrete drivers on demand,
//! wrapping them in [`HostDriverAdapter`] so the rest of the host
//! continues to use [`DatabaseDriver`] (with `AppError` and
//! `crate::models` types).

pub mod adapter;
pub mod conv;
pub mod driver_trait;
pub mod registry;

pub use driver_trait::{DatabaseDriver, PluginMetadataInfo};
pub use registry::{DriverKind, DriverRegistry};
