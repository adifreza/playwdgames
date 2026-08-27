mod config;
mod db;
mod emulator;
mod error;
mod games;
mod metadata;
mod paths;
mod scanner;

use std::sync::Mutex;

use config::{Config, ConfigState};
use db::DbState;
use metadata::MetaState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let cfg = Config::load().expect("gagal load config.json");
    let db = DbState::open().expect("gagal buka library.db");

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(ConfigState(Mutex::new(cfg)))
        .manage(db)
        .manage(MetaState::new())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config::get_config,
            config::set_operator_mode,
            config::set_credentials,
            config::add_library_root,
            config::remove_library_root,
            config::relink_root,
            config::check_library_roots,
            scanner::scan_root,
            scanner::scan_candidates,
            scanner::import_games,
            games::list_games,
            games::remove_game,
            games::launch_game,
            games::get_data_dir,
            games::image_data_url,
            games::import_local_image,
            games::open_game_location,
            games::portablize_path,
            metadata::search_metadata,
            metadata::apply_metadata,
            metadata::auto_match,
            metadata::fetch_artwork,
            metadata::set_game_fields,
            emulator::list_profiles,
            emulator::save_profile,
            emulator::delete_profile,
            emulator::set_game_launch,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
