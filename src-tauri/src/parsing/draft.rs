//! Draft Parquet: an XES upload read once, when its Project Draft first reads
//! it, and written to `{app_data}/drafts/` so every later read of the draft is
//! a Parquet read. A CSV is read from the upload itself. A draft is keyed by the
//! upload's path, size and modification time, so an edited upload reads fresh.

use super::read_event_log;
use super::xes::{is_xes_path, read_xes};
use polars::prelude::*;
use std::collections::hash_map::DefaultHasher;
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::Manager;

/// Held while a draft is written, so two reads of one upload write it once.
static WRITING: Mutex<()> = Mutex::new(());

/// `{app_data}/drafts/`.
pub(crate) fn drafts_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(app_data_dir.join("drafts"))
}

fn draft_path(drafts_dir: &Path, source_path: &str) -> Result<PathBuf, String> {
    let metadata = fs::metadata(source_path).map_err(|e| e.to_string())?;
    let mut hasher = DefaultHasher::new();
    source_path.hash(&mut hasher);
    metadata.len().hash(&mut hasher);
    metadata.modified().ok().hash(&mut hasher);
    Ok(drafts_dir.join(format!("{:016x}.parquet", hasher.finish())))
}

/// The draft of an XES upload, written first when it does not exist yet.
fn written_draft(drafts_dir: &Path, source_path: &str) -> Result<PathBuf, String> {
    let path = draft_path(drafts_dir, source_path)?;
    let _writing = WRITING
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if path.exists() {
        return Ok(path);
    }
    let mut df = read_xes(source_path, None)?;
    fs::create_dir_all(drafts_dir).map_err(|e| e.to_string())?;
    let partial = path.with_extension("parquet.partial");
    let file = fs::File::create(&partial).map_err(|e| e.to_string())?;
    ParquetWriter::new(file)
        .finish(&mut df)
        .map_err(|e| e.to_string())?;
    fs::rename(&partial, &path).map_err(|e| e.to_string())?;
    Ok(path)
}

/// Reads an upload the way the new-project flow sees it, at most `n_rows` rows
/// when given.
pub(crate) fn read_upload(
    drafts_dir: &Path,
    source_path: &str,
    n_rows: Option<usize>,
) -> Result<DataFrame, String> {
    if !is_xes_path(source_path) {
        return read_event_log(source_path, n_rows);
    }
    let path = written_draft(drafts_dir, source_path)?;
    let file = fs::File::open(&path).map_err(|e| e.to_string())?;
    let df = ParquetReader::new(file)
        .finish()
        .map_err(|e| e.to_string())?;
    Ok(match n_rows {
        Some(n) => df.head(Some(n)),
        None => df,
    })
}

/// Removes the draft of one upload, if it has one.
pub(crate) fn discard(drafts_dir: &Path, source_path: &str) -> Result<(), String> {
    let Ok(path) = draft_path(drafts_dir, source_path) else {
        return Ok(());
    };
    match fs::remove_file(path) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

/// Removes every draft. Run at startup: no Project Draft outlives the app.
pub(crate) fn clear(drafts_dir: &Path) -> Result<(), String> {
    match fs::remove_dir_all(drafts_dir) {
        Err(error) if error.kind() != std::io::ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parsing::column_to_strings;

    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("drafts-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn write(&self, name: &str, body: &str) -> String {
            let path = self.0.join(name);
            fs::write(&path, body).unwrap();
            path.to_string_lossy().into_owned()
        }

        fn drafts(&self) -> PathBuf {
            self.0.join("drafts")
        }

        fn draft_count(&self) -> usize {
            fs::read_dir(self.drafts()).map_or(0, |entries| entries.count())
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn xes(activities: &[&str]) -> String {
        let events: String = activities
            .iter()
            .enumerate()
            .map(|(i, activity)| {
                format!(
                    r#"<event><string key="concept:name" value="{activity}"/><date key="time:timestamp" value="2024-03-15T0{i}:00:00"/></event>"#
                )
            })
            .collect();
        format!(r#"<log><trace><string key="concept:name" value="c1"/>{events}</trace></log>"#)
    }

    #[test]
    fn an_xes_upload_is_read_through_one_draft() {
        let scratch = Scratch::new();
        let source = scratch.write("log.xes", &xes(&["A", "B", "C"]));

        let head = read_upload(&scratch.drafts(), &source, Some(2)).unwrap();
        let all = read_upload(&scratch.drafts(), &source, None).unwrap();

        assert_eq!(
            column_to_strings(&head, "concept:name").unwrap(),
            ["A", "B"]
        );
        assert_eq!(all.height(), 3);
        assert_eq!(scratch.draft_count(), 1);
    }

    #[test]
    fn an_edited_upload_is_read_again() {
        let scratch = Scratch::new();
        let source = scratch.write("log.xes", &xes(&["A"]));
        read_upload(&scratch.drafts(), &source, None).unwrap();

        scratch.write("log.xes", &xes(&["A", "B"]));

        assert_eq!(
            read_upload(&scratch.drafts(), &source, None)
                .unwrap()
                .height(),
            2
        );
    }

    #[test]
    fn a_csv_upload_writes_no_draft() {
        let scratch = Scratch::new();
        let source = scratch.write("log.csv", "case,activity\n1,A\n");

        read_upload(&scratch.drafts(), &source, None).unwrap();

        assert_eq!(scratch.draft_count(), 0);
    }

    #[test]
    fn discarding_removes_the_draft_of_that_upload() {
        let scratch = Scratch::new();
        let source = scratch.write("log.xes", &xes(&["A"]));
        read_upload(&scratch.drafts(), &source, None).unwrap();

        discard(&scratch.drafts(), &source).unwrap();

        assert_eq!(scratch.draft_count(), 0);
        discard(&scratch.drafts(), &source).unwrap();
    }

    #[test]
    fn clearing_removes_every_draft() {
        let scratch = Scratch::new();
        let source = scratch.write("log.xes", &xes(&["A"]));
        read_upload(&scratch.drafts(), &source, None).unwrap();

        clear(&scratch.drafts()).unwrap();

        assert!(!scratch.drafts().exists());
        clear(&scratch.drafts()).unwrap();
    }
}
