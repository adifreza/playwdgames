-- Fase 2: metadata game + artwork.
-- cover_path / hero_path relatif ke data/ (mis. "covers/12.jpg").
ALTER TABLE games ADD COLUMN igdb_id      INTEGER;
ALTER TABLE games ADD COLUMN summary      TEXT;
ALTER TABLE games ADD COLUMN genres       TEXT;    -- "Action, Adventure"
ALTER TABLE games ADD COLUMN release_year INTEGER;
ALTER TABLE games ADD COLUMN developer    TEXT;
ALTER TABLE games ADD COLUMN cover_path   TEXT;
ALTER TABLE games ADD COLUMN hero_path    TEXT;
ALTER TABLE games ADD COLUMN match_status TEXT NOT NULL DEFAULT 'unmatched';
