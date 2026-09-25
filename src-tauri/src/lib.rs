mod analysis;
pub mod column_mapping;
mod database;
mod dfg;
pub mod event_log;
mod filters;
pub mod groups;
mod parsing;
mod stats;
mod time;
mod tree;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build());

    // Embedded WebDriver server for the e2e suite, listening on TAURI_WEBDRIVER_PORT.
    #[cfg(feature = "e2e")]
    let builder = builder.plugin(tauri_plugin_wdio_webdriver::init());

    builder
        .invoke_handler(tauri::generate_handler![
            database::commands::prepare_database_backup,
            parsing::commands::preview_event_log,
            parsing::commands::event_log_file_size,
            parsing::commands::analyze_timestamp_columns,
            event_log::commands::create_event_log,
            event_log::commands::check_case_columns,
            event_log::commands::delete_project_files,
            groups::commands::apply_group,
            groups::commands::delete_group_file,
            groups::commands::applied_groups,
            groups::commands::group_stats,
            groups::commands::shared_cases,
            filters::commands::filters_impact,
            filters::commands::group_preview,
            filters::commands::distinct_values,
            filters::commands::duration_histogram,
            filters::commands::daily_case_load,
            tree::commands::directed_tree,
            tree::commands::list_variants,
            tree::commands::node_distributions,
            dfg::commands::dfg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
