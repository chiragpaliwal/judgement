-- Final standings per seat (humans and bots), written when a game completes or ends early.
CREATE TABLE game_seats (
  game_id TEXT NOT NULL,
  seat INTEGER NOT NULL,
  player TEXT,            -- device hash; NULL for bots
  name TEXT NOT NULL,     -- name used in that game
  total INTEGER NOT NULL,
  place INTEGER NOT NULL, -- competition rank (1, 1, 3, ...)
  PRIMARY KEY (game_id, seat)
);
CREATE INDEX game_seats_player ON game_seats (player);

-- Latest name per device, so a renamed player shows up as one person.
CREATE TABLE players (
  player TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
