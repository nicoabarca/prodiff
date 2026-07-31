mod column_mapping;
mod event_log;
mod filters;
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
            event_log::commands::create_event_log,
            event_log::commands::delete_project_files,
            filters::commands::slice_stats,
            filters::commands::chain_impact,
            filters::commands::slice_preview,
            filters::commands::distinct_values,
            filters::commands::shared_cases,
            tree::commands::directed_tree,
            tree::commands::list_variants
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
