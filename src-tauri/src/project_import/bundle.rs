//! Opening a study bundle: a `.zip`, or the folder it unzips into, holding
//! `manifest.json` and one `.csv`, at its root or inside one folder.

use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};

pub const MANIFEST_FILE: &str = "manifest.json";

#[derive(serde::Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct OpenedBundle {
    pub manifest_text: String,
    pub csv_path: String,
    pub csv_file_name: String,
}

/// Reads the manifest and finds the CSV in the bundle at `path`. A zip has its
/// CSV extracted into `imports_dir`, which is emptied first; a folder is read
/// in place.
pub fn open(path: &Path, imports_dir: &Path) -> Result<OpenedBundle, String> {
    if path.is_dir() {
        open_folder(path)
    } else if path.is_file() {
        open_zip(path, imports_dir)
    } else {
        Err("The study file is not a zip file or a folder.".to_string())
    }
}

/// Files macOS adds when it compresses or copies a folder.
fn ignored(components: &[String]) -> bool {
    let name = components.last().map(String::as_str).unwrap_or_default();
    components.first().is_some_and(|first| first == "__MACOSX")
        || name == ".DS_Store"
        || name.starts_with("._")
}

fn is_csv(components: &[String]) -> bool {
    components
        .last()
        .is_some_and(|name| name.to_lowercase().ends_with(".csv"))
}

/// The positions of the manifest and the CSV among `paths`, each a file's path
/// components inside the bundle.
fn locate(paths: &[Vec<String>]) -> Result<(usize, usize), String> {
    let kept: Vec<usize> = (0..paths.len()).filter(|&i| !ignored(&paths[i])).collect();
    let depths: Vec<usize> = kept.iter().map(|&i| paths[i].len()).collect();
    let nested = depths.iter().all(|&depth| depth == 2);
    if !(depths.iter().all(|&depth| depth == 1) || nested) {
        return Err(
            "The study file must hold manifest.json and the CSV together, at its top or inside one folder."
                .to_string(),
        );
    }
    if nested && kept.iter().any(|&i| paths[i][0] != paths[kept[0]][0]) {
        return Err("The study file holds more than one folder.".to_string());
    }
    let manifests: Vec<usize> = kept
        .iter()
        .copied()
        .filter(|&i| paths[i].last().is_some_and(|name| name == MANIFEST_FILE))
        .collect();
    let csvs: Vec<usize> = kept.iter().copied().filter(|&i| is_csv(&paths[i])).collect();
    match (manifests.as_slice(), csvs.as_slice()) {
        ([], _) => Err("The study file has no manifest.json.".to_string()),
        (_, []) => Err("The study file has no CSV file.".to_string()),
        (_, [_, _, ..]) => Err(format!("The study file has {} CSV files.", csvs.len())),
        ([manifest], [csv]) if kept.len() == 2 => Ok((*manifest, *csv)),
        _ => Err("The study file holds files other than manifest.json and one CSV.".to_string()),
    }
}

fn components(path: &Path) -> Vec<String> {
    path.components()
        .map(|c| c.as_os_str().to_string_lossy().into_owned())
        .collect()
}

fn file_name(components: &[String]) -> String {
    components.last().cloned().unwrap_or_default()
}

fn open_folder(root: &Path) -> Result<OpenedBundle, String> {
    let mut paths = Vec::new();
    for entry in fs::read_dir(root).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if !entry.path().is_dir() {
            paths.push(vec![name]);
            continue;
        }
        for inner in fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
            let inner = inner.map_err(|e| e.to_string())?;
            let inner_name = inner.file_name().to_string_lossy().into_owned();
            let mut path = vec![name.clone(), inner_name];
            if inner.path().is_dir() {
                path.push(String::new());
            }
            paths.push(path);
        }
    }
    let (manifest, csv) = locate(&paths)?;
    let full = |parts: &[String]| parts.iter().fold(root.to_path_buf(), |dir, p| dir.join(p));
    let manifest_text = fs::read_to_string(full(&paths[manifest])).map_err(|e| e.to_string())?;
    Ok(OpenedBundle {
        manifest_text,
        csv_path: full(&paths[csv]).to_string_lossy().into_owned(),
        csv_file_name: file_name(&paths[csv]),
    })
}

fn open_zip(path: &Path, imports_dir: &Path) -> Result<OpenedBundle, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|_| "The study file is not a zip file or a folder.".to_string())?;

    let mut paths = Vec::new();
    let mut indices = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|e| e.to_string())?;
        if entry.is_dir() {
            continue;
        }
        let name: PathBuf = entry.enclosed_name().ok_or_else(|| {
            let raw = String::from_utf8_lossy(entry.name_raw()).into_owned();
            format!("The study file has an unsafe path: {raw}")
        })?;
        paths.push(components(&name));
        indices.push(index);
    }
    let (manifest, csv) = locate(&paths)?;

    let mut manifest_text = String::new();
    archive
        .by_index(indices[manifest])
        .map_err(|e| e.to_string())?
        .read_to_string(&mut manifest_text)
        .map_err(|e| format!("manifest.json: {e}"))?;

    if imports_dir.exists() {
        fs::remove_dir_all(imports_dir).map_err(|e| e.to_string())?;
    }
    fs::create_dir_all(imports_dir).map_err(|e| e.to_string())?;
    let csv_file_name = file_name(&paths[csv]);
    let csv_path = imports_dir.join(&csv_file_name);
    let mut entry = archive.by_index(indices[csv]).map_err(|e| e.to_string())?;
    let mut out = fs::File::create(&csv_path).map_err(|e| e.to_string())?;
    io::copy(&mut entry, &mut out).map_err(|e| format!("{csv_file_name}: {e}"))?;

    Ok(OpenedBundle {
        manifest_text,
        csv_path: csv_path.to_string_lossy().into_owned(),
        csv_file_name,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use zip::write::SimpleFileOptions;

    /// A fresh directory under the system temp dir, removed when dropped.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new(label: &str) -> Self {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos();
            let dir = std::env::temp_dir().join(format!("bundle-{label}-{nanos}"));
            fs::create_dir_all(&dir).unwrap();
            Self(dir)
        }

        fn zip(&self, entries: &[(&str, &str)]) -> PathBuf {
            let path = self.0.join("study.zip");
            let mut writer = zip::ZipWriter::new(fs::File::create(&path).unwrap());
            for (name, text) in entries {
                writer
                    .start_file(*name, SimpleFileOptions::default())
                    .unwrap();
                writer.write_all(text.as_bytes()).unwrap();
            }
            writer.finish().unwrap();
            path
        }

        fn imports(&self) -> PathBuf {
            self.0.join("imports")
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn reads_a_zip_with_files_at_its_root() {
        let scratch = Scratch::new("root");
        let zip = scratch.zip(&[("manifest.json", "{}"), ("fines.csv", "a,b\n1,2\n")]);
        let opened = open(&zip, &scratch.imports()).unwrap();
        assert_eq!(opened.manifest_text, "{}");
        assert_eq!(opened.csv_file_name, "fines.csv");
        assert_eq!(fs::read_to_string(&opened.csv_path).unwrap(), "a,b\n1,2\n");
    }

    #[test]
    fn reads_a_zip_with_one_folder_and_macos_extras() {
        let scratch = Scratch::new("nested");
        let zip = scratch.zip(&[
            ("study/manifest.json", "{}"),
            ("study/fines.csv", "x\n"),
            ("study/.DS_Store", ""),
            ("__MACOSX/study/._fines.csv", ""),
        ]);
        let opened = open(&zip, &scratch.imports()).unwrap();
        assert_eq!(opened.csv_file_name, "fines.csv");
    }

    #[test]
    fn rejects_a_second_csv_a_missing_manifest_and_an_escaping_path() {
        let scratch = Scratch::new("bad");
        let two = scratch.zip(&[("manifest.json", "{}"), ("a.csv", ""), ("b.csv", "")]);
        assert!(open(&two, &scratch.imports()).unwrap_err().contains("2 CSV files"));

        let none = scratch.zip(&[("a.csv", "")]);
        assert!(open(&none, &scratch.imports()).unwrap_err().contains("no manifest.json"));

        let escaping = scratch.zip(&[("manifest.json", "{}"), ("../a.csv", "")]);
        assert!(open(&escaping, &scratch.imports()).unwrap_err().contains("unsafe path"));
    }

    #[test]
    fn rejects_a_file_that_is_not_a_zip() {
        let scratch = Scratch::new("text");
        let path = scratch.0.join("study.txt");
        fs::write(&path, "hello").unwrap();
        assert!(open(&path, &scratch.imports()).unwrap_err().contains("not a zip"));
    }

    #[test]
    fn reads_an_unzipped_folder_in_place() {
        let scratch = Scratch::new("folder");
        let root = scratch.0.join("study");
        fs::create_dir_all(root.join("study")).unwrap();
        fs::write(root.join("study/manifest.json"), "{}").unwrap();
        fs::write(root.join("study/fines.csv"), "x\n").unwrap();
        let opened = open(&root, &scratch.imports()).unwrap();
        assert_eq!(PathBuf::from(&opened.csv_path), root.join("study/fines.csv"));
        assert!(!scratch.imports().exists());
    }
}
