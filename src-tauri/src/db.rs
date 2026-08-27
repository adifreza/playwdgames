use std::sync::Mutex;

use rusqlite::Connection;

use crate::config::data_dir;
use crate::error::Result;

/// Daftar migration berurutan. Index + 1 = versi target.
/// Tambah entry baru di akhir untuk Fase berikutnya, jangan ubah yang lama.
const MIGRATIONS: &[&str] = &[
    include_str!("../migrations/001_init.sql"),
    include_str!("../migrations/002_metadata.sql"),
    include_str!("../migrations/003_emulator.sql"),
    include_str!("../migrations/004_manual_action.sql"),
];

/// Jalankan migration yang belum diterapkan berdasarkan `PRAGMA user_version`.
fn migrate(conn: &Connection) -> Result<()> {
    let current: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let version = (i + 1) as i64;
        if version > current {
            conn.execute_batch(sql)?;
            // user_version tidak bisa pakai parameter binding
            conn.execute_batch(&format!("PRAGMA user_version = {version}"))?;
        }
    }
    Ok(())
}

pub struct DbState(pub Mutex<Connection>);

impl DbState {
    pub fn open() -> Result<DbState> {
        let conn = Connection::open(data_dir()?.join("library.db"))?;
        conn.execute_batch("PRAGMA foreign_keys = ON;")?;
        migrate(&conn)?;
        Ok(DbState(Mutex::new(conn)))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let conn = Connection::open_in_memory().unwrap();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap(); // jalankan lagi: tidak boleh error
        let v: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        assert_eq!(v, MIGRATIONS.len() as i64);
        // tabel games ada
        conn.query_row("SELECT COUNT(*) FROM games", [], |r| r.get::<_, i64>(0))
            .unwrap();
    }
}
