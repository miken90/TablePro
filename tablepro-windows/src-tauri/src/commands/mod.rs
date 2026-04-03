pub mod ai;
pub mod connection;
pub mod data;
pub mod export;
pub(crate) mod export_formats;
pub(crate) mod export_writers;
pub mod filter;
pub mod history;
pub mod import;
pub mod query;
pub mod schema;
pub mod settings;
pub mod storage;
pub mod structure;
pub mod tab_state;

pub use connection::{connect, disconnect, get_connection_status, get_driver_capabilities, list_drivers, test_connection};
pub use data::{generate_row_sql, save_changes};
pub use export::export_to_file;
pub use filter::{delete_filter_preset, load_filter_presets, save_filter_preset};
pub use history::{
    history_clear_all, history_delete_entry, history_fetch_recent, history_record, history_search,
};
pub use import::{import_preview, import_sql_file};
pub use query::{cancel_query, execute_query, fetch_count, fetch_rows};
pub use schema::{
    fetch_approximate_count, fetch_columns, fetch_databases, fetch_ddl, fetch_enum_values,
    fetch_foreign_keys, fetch_indexes, fetch_routines, fetch_schemas, fetch_tables,
    switch_database,
};
pub use settings::{get_settings, log_renderer_error, set_settings};
pub use storage::{
    delete_connection, delete_group, list_connections, list_groups, save_connection, save_group,
};
pub use structure::{apply_alter, create_table, generate_alter_sql_command};
pub use tab_state::{get_tab_state, mark_localstorage_migrated, set_tab_state};
pub use ai::{ai_cancel_chat, ai_chat_stream, ai_list_models, ai_test_provider};
