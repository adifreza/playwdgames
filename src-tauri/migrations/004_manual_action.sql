-- Fase 2+: action launch manual per-game (ala Playnite "Play action" tipe File).
-- Dipakai kalau launch_type = 'manual'.
ALTER TABLE games ADD COLUMN custom_exe     TEXT;
ALTER TABLE games ADD COLUMN custom_args    TEXT;
ALTER TABLE games ADD COLUMN custom_workdir TEXT;
