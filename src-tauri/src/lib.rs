mod analysis;
mod column_mapping;
mod event_log;
mod filters;
mod groups;
mod parsing;
mod stats;
mod time;
mod tree;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
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
            tree::commands::node_distributions
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
