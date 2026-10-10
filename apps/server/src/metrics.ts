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

/** Competition ranks (1, 1, 3, ...): equal totals share a place. */
export function places(totals: number[]): number[] {
  return totals.map((t) => 1 + totals.filter((o) => o > t).length);
}

/** Remembers the latest name a device played under; older writes never overwrite newer ones. */
function upsertPlayer(db: D1Database, player: string, name: string, at: number) {
  return db
    .prepare(
      `INSERT INTO players (player, name, updated_at) VALUES (?, ?, ?)
       ON CONFLICT (player) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at
       WHERE excluded.updated_at >= players.updated_at`,
    )
    .bind(player, name, at);
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
           (id, room, started_at, humans, bots, rounds_planned, start_cards, tracker, turn_timer, scoring)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(id, s.code, s.gameStartedAt ?? s.createdAt, humans.length, bots, g.plan.length, s.settings.startCards, s.settings.tracker ? 1 : 0, s.settings.turnTimer, s.settings.scoring ?? 'classic'),
      ...hashes.map((h) => db.prepare('INSERT OR IGNORE INTO game_players (game_id, player) VALUES (?, ?)').bind(id, h)),
      ...hashes.map((h, i) => upsertPlayer(db, h, humans[i].name, s.gameStartedAt ?? s.createdAt)),
    ]);
  });
}

export function gameEnded(db: D1Database, s: RoomState, status: GameStatus, now: number) {
  const id = gameId(s);
  const roundsPlayed = s.game?.history.length ?? 0;
  const startedAt = s.gameStartedAt ?? s.createdAt;
  log('game_ended', { room: s.code, game: id, status, roundsPlayed, durationMs: now - startedAt });
  return safe('gameEnded', s.code, async () => {
    const update = db
      .prepare("UPDATE games SET status = ?, ended_at = ?, rounds_played = ? WHERE id = ? AND status = 'active'")
      .bind(status, now, roundsPlayed, id);
    const g = s.game;
    if (status === 'abandoned' || !g) return update.run();
    // Seat i is members[i] for the whole game (the room locks once it starts).
    const ranks = places(g.totals);
    const hashes = await Promise.all(s.members.map((m) => (m.isBot ? null : playerHash(m.deviceId))));
    await db.batch([
      update,
      ...s.members.map((m, i) =>
        db
          .prepare('INSERT OR IGNORE INTO game_seats (game_id, seat, player, name, total, place) VALUES (?, ?, ?, ?, ?, ?)')
          .bind(id, i, hashes[i], m.name, g.totals[i] ?? 0, ranks[i] ?? s.members.length),
      ),
      ...s.members.flatMap((m, i) => (hashes[i] ? [upsertPlayer(db, hashes[i], m.name, now)] : [])),
    ]);
  });
}

export interface HistorySeat {
  name: string;
  /** The device's latest name, when it differs from the one used in this game. */
  currentName: string | null;
  total: number;
  place: number;
  isBot: boolean;
  isMe: boolean;
}

export interface HistoryGame {
  id: string;
  startedAt: number;
  durationMs: number | null;
  status: 'completed' | 'ended_early';
  scoring: 'classic' | 'stakes';
  roundsPlayed: number;
  roundsPlanned: number;
  seats: HistorySeat[];
}

export interface History {
  games: HistoryGame[];
  /** Pass back as `before` to load older games; null when there are none. */
  next: number | null;
}

const HISTORY_PAGE = 30;

export async function readHistory(db: D1Database, deviceId: string, before: number | null): Promise<History> {
  const me = await playerHash(deviceId);
  const { results: games } = await db
    .prepare(
      `SELECT g.id, g.started_at, g.ended_at, g.status, g.scoring, g.rounds_played, g.rounds_planned
       FROM game_seats s JOIN games g ON g.id = s.game_id
       WHERE s.player = ? AND g.status IN ('completed', 'ended_early') AND g.started_at < ?
       ORDER BY g.started_at DESC LIMIT ?`,
    )
    .bind(me, before ?? Number.MAX_SAFE_INTEGER, HISTORY_PAGE)
    .all<{ id: string; started_at: number; ended_at: number | null; status: HistoryGame['status']; scoring: HistoryGame['scoring']; rounds_played: number; rounds_planned: number }>();
  if (!games.length) return { games: [], next: null };

  const { results: seats } = await db
    .prepare(
      `SELECT s.game_id, s.seat, s.player, s.name, s.total, s.place, p.name AS current_name
       FROM game_seats s LEFT JOIN players p ON p.player = s.player
       WHERE s.game_id IN (${games.map(() => '?').join(',')})
       ORDER BY s.place, s.seat`,
    )
    .bind(...games.map((g) => g.id))
    .all<{ game_id: string; player: string | null; name: string; total: number; place: number; current_name: string | null }>();

  const byGame = new Map<string, HistorySeat[]>();
  for (const r of seats) {
    const list = byGame.get(r.game_id) ?? [];
    list.push({
      name: r.name,
      currentName: r.current_name && r.current_name !== r.name ? r.current_name : null,
      total: r.total,
      place: r.place,
      isBot: r.player === null,
      isMe: r.player === me,
    });
    byGame.set(r.game_id, list);
  }
  return {
    games: games.map((g) => ({
      id: g.id,
      startedAt: g.started_at,
      durationMs: g.ended_at === null ? null : g.ended_at - g.started_at,
      status: g.status,
      scoring: g.scoring,
      roundsPlayed: g.rounds_played,
      roundsPlanned: g.rounds_planned,
      seats: byGame.get(g.id) ?? [],
    })),
    next: games.length === HISTORY_PAGE ? games[games.length - 1].started_at : null,
  };
}

export interface LeaderboardRow {
  name: string;
  games: number;
  wins: number;
  winRate: number;
  avgPlace: number;
  isMe: boolean;
}

/** Everyone this device has finished a game with, counted over those shared games only. */
export async function readLeaderboard(db: D1Database, deviceId: string): Promise<LeaderboardRow[]> {
  const me = await playerHash(deviceId);
  const { results } = await db
    .prepare(
      `SELECT s.player, COALESCE(p.name, MAX(s.name)) AS name, COUNT(*) AS games,
         SUM(s.place = 1) AS wins, AVG(s.place) AS avg_place
       FROM game_seats mine
       JOIN games g ON g.id = mine.game_id AND g.status = 'completed'
       JOIN game_seats s ON s.game_id = mine.game_id AND s.player IS NOT NULL
       LEFT JOIN players p ON p.player = s.player
       WHERE mine.player = ?
       GROUP BY s.player
       ORDER BY wins DESC, wins * 1.0 / games DESC, avg_place ASC, games DESC
       LIMIT 50`,
    )
    .bind(me)
    .all<{ player: string; name: string; games: number; wins: number; avg_place: number }>();
  return results.map((r) => ({
    name: r.name,
    games: Number(r.games),
    wins: Number(r.wins),
    winRate: Number(r.wins) / Number(r.games),
    avgPlace: Math.round(Number(r.avg_place) * 10) / 10,
    isMe: r.player === me,
  }));
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
