-- Fase 4: profil emulator + assignment per-game.
CREATE TABLE emulator_profiles (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    kind         TEXT NOT NULL,            -- 'pcsx2' | 'rpcs3' | 'custom'
    exe_path     TEXT NOT NULL,
    default_args TEXT NOT NULL DEFAULT ''  -- argumen tambahan, dipisah spasi
);

ALTER TABLE games ADD COLUMN emulator_profile_id INTEGER REFERENCES emulator_profiles(id) ON DELETE SET NULL;
ALTER TABLE games ADD COLUMN game_media_path     TEXT;  -- path ISO / folder game (buat emulator)
