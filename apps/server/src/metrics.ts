import type { RoomState } from './core';

export type GameStatus = 'completed' | 'ended_early' | 'abandoned';

/** One JSON line per event, for Workers Logs (observability is on in wrangler.jsonc). */
export function log(event: string, fields: Record<string, unknown>) {
  console.log(JSON.stringify({ event, ...fields }));
}

export const gameId = (s: RoomState) => `${s.code}:${s.gameStartedAt ?? s.createdAt}`;

/** Truncated hash, so returning players can be counted without storing the secret device id. */
async function playerHash(deviceId: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(deviceId));
  return Array.from(new Uint8Array(buf).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Metrics must never break gameplay: failures are logged and swallowed. */
async function safe(what: string, room: string, fn: () => Promise<unknown>) {
  try {
    await fn();
  } catch (err) {
    log('metrics_error', { what, room, error: String(err) });
  }
}

export function roomCreated(db: D1Database, code: string, now: number, country: string | null) {
  log('room_created', { room: code, country });
  return safe('roomCreated', code, () =>
    db.prepare('INSERT OR IGNORE INTO rooms (code, created_at, country) VALUES (?, ?, ?)').bind(code, now, country).run(),
  );
}

export function gameStarted(db: D1Database, s: RoomState) {
  const g = s.game;
  if (!g) return Promise.resolve();
  const id = gameId(s);
  const humans = s.members.filter((m) => !m.isBot);
  const bots = s.members.length - humans.length;
  log('game_started', { room: s.code, game: id, humans: humans.length, bots, rounds: g.plan.length });
  return safe('gameStarted', s.code, async () => {
    const hashes = await Promise.all(humans.map((m) => playerHash(m.deviceId)));
    await db.batch([
      db
        .prepare(
          `INSERT OR IGNORE INTO games
           (id, room, started_at, humans, bots, rounds_planned, start_cards, tracker, turn_timer)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, s.code, s.gameStartedAt ?? s.createdAt, humans.length, bots, g.plan.length, s.settings.startCards, s.settings.tracker ? 1 : 0, s.settings.turnTimer),
      ...hashes.map((h) => db.prepare('INSERT OR IGNORE INTO game_players (game_id, player) VALUES (?, ?)').bind(id, h)),
    ]);
  });
}

export function gameEnded(db: D1Database, s: RoomState, status: GameStatus, now: number) {
  const id = gameId(s);
  const roundsPlayed = s.game?.history.length ?? 0;
  const startedAt = s.gameStartedAt ?? s.createdAt;
  log('game_ended', { room: s.code, game: id, status, roundsPlayed, durationMs: now - startedAt });
  return safe('gameEnded', s.code, () =>
    db
      .prepare("UPDATE games SET status = ?, ended_at = ?, rounds_played = ? WHERE id = ? AND status = 'active'")
      .bind(status, now, roundsPlayed, id)
      .run(),
  );
}

export interface Stats {
  days: number;
  totals: {
    rooms: number;
    games: number;
    completed: number;
    endedEarly: number;
    abandoned: number;
    active: number;
    uniquePlayers: number;
    avgDurationMs: number | null;
  };
  daily: { day: string; started: number; completed: number; abandoned: number }[];
  byPlayers: { humans: number; bots: number; games: number }[];
}

export async function readStats(db: D1Database, days: number, now: number): Promise<Stats> {
  const since = now - days * 86_400_000;
  const [rooms, totals, players, daily, byPlayers] = await db.batch<Record<string, number | null>>([
    db.prepare('SELECT COUNT(*) AS n FROM rooms WHERE created_at >= ?').bind(since),
    db
      .prepare(
        `SELECT COUNT(*) AS games,
           COALESCE(SUM(status = 'completed'), 0) AS completed,
           COALESCE(SUM(status = 'ended_early'), 0) AS endedEarly,
           COALESCE(SUM(status = 'abandoned'), 0) AS abandoned,
           COALESCE(SUM(status = 'active'), 0) AS active,
           AVG(CASE WHEN status = 'completed' THEN ended_at - started_at END) AS avgDurationMs
         FROM games WHERE started_at >= ?`,
      )
      .bind(since),
    db
      .prepare(
        'SELECT COUNT(DISTINCT p.player) AS n FROM game_players p JOIN games g ON g.id = p.game_id WHERE g.started_at >= ?',
      )
      .bind(since),
    db
      .prepare(
        `SELECT date(started_at / 1000, 'unixepoch') AS day, COUNT(*) AS started,
           SUM(status = 'completed') AS completed, SUM(status = 'abandoned') AS abandoned
         FROM games WHERE started_at >= ? GROUP BY day ORDER BY day`,
      )
      .bind(since),
    db
      .prepare('SELECT humans, bots, COUNT(*) AS games FROM games WHERE started_at >= ? GROUP BY humans, bots ORDER BY games DESC')
      .bind(since),
  ]);
  const t = totals.results[0] as Record<string, number | null>;
  return {
    days,
    totals: {
      rooms: Number(rooms.results[0].n),
      games: Number(t.games),
      completed: Number(t.completed),
      endedEarly: Number(t.endedEarly),
      abandoned: Number(t.abandoned),
      active: Number(t.active),
      uniquePlayers: Number(players.results[0].n),
      avgDurationMs: t.avgDurationMs === null ? null : Math.round(Number(t.avgDurationMs)),
    },
    daily: daily.results as unknown as Stats['daily'],
    byPlayers: byPlayers.results as unknown as Stats['byPlayers'],
  };
}
