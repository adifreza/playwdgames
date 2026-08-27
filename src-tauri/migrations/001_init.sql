-- Fase 1: tabel game hasil scan.
-- rel_path disimpan relatif terhadap root library supaya portable antar drive letter.
CREATE TABLE games (
    id          INTEGER PRIMARY KEY,
    title       TEXT    NOT NULL,
    root_id     TEXT    NOT NULL,
    rel_path    TEXT    NOT NULL,
    launch_type TEXT    NOT NULL DEFAULT 'native', -- native | pcsx2 | rpcs3 (Fase 4)
    added_at    INTEGER NOT NULL,
    UNIQUE(root_id, rel_path)
);
