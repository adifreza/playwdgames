use std::path::{Path, PathBuf};

use crate::config::Config;

/// Marker path media yang portable: "root::<rootId>::<rel>".
const ROOT_PREFIX: &str = "root::";

/// Simpan path media relatif ke library root kalau berada di bawahnya,
/// supaya tetap ketemu walau drive letter HDD berubah.
pub fn portablize_media(abs: &str, cfg: &Config) -> String {
    let abs_norm = abs.replace('\\', "/");
    for root in &cfg.library_roots {
        let root_norm = root.path.replace('\\', "/");
        if let Ok(rel) = Path::new(&abs_norm).strip_prefix(&root_norm) {
            return format!("{ROOT_PREFIX}{}::{}", root.id, rel.to_string_lossy().replace('\\', "/"));
        }
    }
    abs.to_string()
}

/// Kebalikan `portablize_media`: kembalikan path absolut sekarang.
pub fn resolve_media(stored: &str, cfg: &Config) -> Option<PathBuf> {
    match stored.strip_prefix(ROOT_PREFIX) {
        Some(rest) => {
            let (root_id, rel) = rest.split_once("::")?;
            let root = cfg.library_roots.iter().find(|r| r.id == root_id)?;
            Some(PathBuf::from(&root.path).join(rel))
        }
        None => Some(PathBuf::from(stored)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::LibraryRoot;

    fn cfg() -> Config {
        Config {
            library_roots: vec![LibraryRoot {
                id: "r1".into(),
                label: "HDD".into(),
                path: "D:/Games".into(),
            }],
            ..Config::default()
        }
    }

    #[test]
    fn roundtrip_inside_root() {
        let c = cfg();
        let stored = portablize_media("D:/Games/PS2/gow.iso", &c);
        assert_eq!(stored, "root::r1::PS2/gow.iso");
        assert_eq!(
            resolve_media(&stored, &c).unwrap(),
            PathBuf::from("D:/Games/PS2/gow.iso")
        );
    }

    #[test]
    fn outside_root_stays_absolute() {
        let c = cfg();
        let stored = portablize_media("E:/Iso/x.iso", &c);
        assert_eq!(stored, "E:/Iso/x.iso");
    }

    #[test]
    fn resolve_after_drive_letter_change() {
        let mut c = cfg();
        let stored = portablize_media("D:/Games/PS2/gow.iso", &c);
        c.library_roots[0].path = "F:/Games".into(); // HDD dimount ulang
        assert_eq!(
            resolve_media(&stored, &c).unwrap(),
            PathBuf::from("F:/Games/PS2/gow.iso")
        );
    }
}
