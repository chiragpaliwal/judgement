-- One row per room created (codes are reused once a room expires, hence the composite key).
CREATE TABLE rooms (
  code TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  country TEXT,
  PRIMARY KEY (code, created_at)
);
CREATE INDEX rooms_created_at ON rooms (created_at);

-- One row per game started. status: active | completed | ended_early | abandoned.
CREATE TABLE games (
  id TEXT PRIMARY KEY,
  room TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  humans INTEGER NOT NULL,
  bots INTEGER NOT NULL,
  rounds_planned INTEGER NOT NULL,
  rounds_played INTEGER NOT NULL DEFAULT 0,
  start_cards INTEGER NOT NULL,
  tracker INTEGER NOT NULL,
  turn_timer INTEGER NOT NULL
);
CREATE INDEX games_started_at ON games (started_at);

-- Humans seated in each game. player is a truncated SHA-256 of the device id, never the id itself.
CREATE TABLE game_players (
  game_id TEXT NOT NULL,
  player TEXT NOT NULL,
  PRIMARY KEY (game_id, player)
);
CREATE INDEX game_players_player ON game_players (player);
