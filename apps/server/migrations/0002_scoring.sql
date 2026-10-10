-- Scoring mode per game: classic (10 + bid, miss 0) | stakes (±(11 × bid + 10)).
ALTER TABLE games ADD COLUMN scoring TEXT NOT NULL DEFAULT 'classic';
