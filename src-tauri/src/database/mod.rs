//! Where copies of the SQLite database go before a migration runs. The
//! frontend owns the database and writes the copy itself; this only makes room
//! for it.

pub mod commands;

use std::fs;
use std::path::{Path, PathBuf};

/// How many backups `{app_data}/backups/` holds, the new one included.
const KEEP: usize = 3;

/// `{app_data}/backups/`.
fn backups_dir(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("backups")
}

/// Creates the backups folder, frees the path for a database at `from_version`
/// and drops the oldest backups past `KEEP`. Returns the path to write to.
pub(crate) fn prepare_backup(app_data_dir: &Path, from_version: u32) -> Result<PathBuf, String> {
    let dir = backups_dir(app_data_dir);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let target = dir.join(format!("prodiff-v{from_version}.db"));
    if target.exists() {
        fs::remove_file(&target).map_err(|e| e.to_string())?;
    }

    let mut existing: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| entry.ok())
        .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "db"))
        .filter_map(|entry| Some((entry.metadata().ok()?.modified().ok()?, entry.path())))
        .collect();
    existing.sort_by(|a, b| b.0.cmp(&a.0));
    for (_, path) in existing.into_iter().skip(KEEP - 1) {
        fs::remove_file(path).map_err(|e| e.to_string())?;
    }
    Ok(target)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(label: &str) -> PathBuf {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("backups-{label}-{nanos}"));
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut names: Vec<String> = fs::read_dir(backups_dir(dir))
            .unwrap()
            .map(|entry| entry.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        names.sort();
        names
    }

    #[test]
    fn names_the_backup_after_the_version_it_holds() {
        let dir = scratch("name");
        let target = prepare_backup(&dir, 4).unwrap();
        assert_eq!(target, dir.join("backups").join("prodiff-v4.db"));
        assert!(!target.exists());
    }

    #[test]
    fn frees_a_path_already_taken() {
        let dir = scratch("taken");
        let target = prepare_backup(&dir, 2).unwrap();
        fs::write(&target, "old").unwrap();
        prepare_backup(&dir, 2).unwrap();
        assert!(!target.exists());
    }

    #[test]
    fn keeps_room_for_the_newest_backups_only() {
        let dir = scratch("prune");
        for version in 1..=4 {
            let target = prepare_backup(&dir, version).unwrap();
            fs::write(&target, "db").unwrap();
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        prepare_backup(&dir, 5).unwrap();
        assert_eq!(names(&dir), ["prodiff-v3.db", "prodiff-v4.db"]);
    }
}
