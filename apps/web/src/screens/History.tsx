import { useCallback, useEffect, useState } from 'react';
import { deviceId } from '../lib/identity';
import { navigate } from '../lib/router';
import { signed } from './Scoreboard';

interface Seat {
  name: string;
  currentName: string | null;
  total: number;
  place: number;
  isBot: boolean;
  isMe: boolean;
}

interface Game {
  id: string;
  startedAt: number;
  durationMs: number | null;
  status: 'completed' | 'ended_early';
  scoring: 'classic' | 'stakes';
  roundsPlayed: number;
  roundsPlanned: number;
  seats: Seat[];
}

interface Row {
  name: string;
  games: number;
  wins: number;
  winRate: number;
  avgPlace: number;
  isMe: boolean;
}

type Tab = 'games' | 'leaderboard';

const ordinal = (n: number) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
};
const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const minutes = (ms: number | null) => (ms === null ? null : `${Math.max(1, Math.round(ms / 60_000))} min`);

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ deviceId: deviceId(), ...body }),
  });
  if (!res.ok) throw new Error();
  return (await res.json()) as T;
}

const rowStyle = (me: boolean) => ({
  display: 'flex',
  alignItems: 'baseline',
  gap: 10,
  padding: '6px 8px',
  borderRadius: 8,
  background: me ? 'var(--surface-2)' : undefined,
  fontWeight: me ? 700 : undefined,
});

function SeatName({ seat }: { seat: Seat }) {
  return (
    <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {seat.currentName ?? seat.name}
      {seat.isMe && <span className="dim"> (you)</span>}
      {seat.currentName && <span className="dim" style={{ fontWeight: 400 }}> as {seat.name}</span>}
    </span>
  );
}

function GameCard({ game }: { game: Game }) {
  const [open, setOpen] = useState(false);
  const me = game.seats.find((s) => s.isMe);
  const winners = game.seats.filter((s) => s.place === 1);
  const tied = me ? game.seats.filter((s) => s.place === me.place).length > 1 : false;
  const length = minutes(game.durationMs);
  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 16 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left', padding: '14px 16px', display: 'flex', gap: 12, alignItems: 'center' }}
      >
        <span style={{ fontSize: 22, fontWeight: 700, minWidth: 48, color: me?.place === 1 ? 'var(--amber)' : undefined }}>
          {me ? `${tied ? '=' : ''}${ordinal(me.place)}` : '–'}
        </span>
        <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {winners.map((w) => w.currentName ?? w.name).join(' & ')} {winners.length > 1 ? 'tie' : 'wins'}
          </span>
          <span className="dim" style={{ fontSize: 13 }}>
            {when(game.startedAt)} · {game.seats.length} players · {game.scoring === 'stakes' ? 'Stakes' : 'Classic'}
            {length && ` · ${length}`}
            {game.status === 'ended_early' && ` · ended early (${game.roundsPlayed}/${game.roundsPlanned})`}
          </span>
        </span>
        <span className="dim" aria-hidden style={{ transform: open ? 'rotate(90deg)' : undefined, transition: 'transform .15s' }}>
          ›
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {game.seats.map((s, i) => (
            <div key={i} style={rowStyle(s.isMe)}>
              <span className="dim" style={{ minWidth: 24 }}>{s.place}</span>
              <SeatName seat={s} />
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{signed(s.total)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Games() {
  const [games, setGames] = useState<Game[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (before: number | null) => {
    setBusy(true);
    setError(null);
    try {
      const data = await post<{ games: Game[]; next: number | null }>('/api/me/history', { before });
      setGames((g) => (before === null ? data.games : [...(g ?? []), ...data.games]));
      setNext(data.next);
    } catch {
      setError('Couldn’t load your games.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  if (error) return <span style={{ color: 'var(--coral)' }}>{error}</span>;
  if (!games) return <span className="dim">Loading…</span>;
  if (!games.length) return <p className="dim">Finish a game to see it here.</p>;
  return (
    <>
      {games.map((g) => (
        <GameCard key={g.id} game={g} />
      ))}
      {next !== null && (
        <button className="btn ghost" disabled={busy} onClick={() => void load(next)}>
          {busy ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}

function Leaderboard() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    post<{ rows: Row[] }>('/api/me/leaderboard', {})
      .then((d) => setRows(d.rows))
      .catch(() => setError('Couldn’t load the leaderboard.'));
  }, []);

  if (error) return <span style={{ color: 'var(--coral)' }}>{error}</span>;
  if (!rows) return <span className="dim">Loading…</span>;
  if (!rows.length) return <p className="dim">Finish a game to see it here.</p>;
  return (
    <section style={{ background: 'var(--surface-1)', borderRadius: 16, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
      <p className="dim" style={{ fontSize: 13, margin: '4px 8px 8px' }}>
        Everyone you’ve finished a game with, counting only the games you played together.
      </p>
      <div className="k" style={{ ...rowStyle(false), fontWeight: 400 }}>
        <span style={{ minWidth: 24 }}>#</span>
        <span style={{ flex: 1 }}>Player</span>
        <span style={{ minWidth: 40, textAlign: 'right' }}>Wins</span>
        <span style={{ minWidth: 44, textAlign: 'right' }}>Win %</span>
        <span style={{ minWidth: 40, textAlign: 'right' }}>Games</span>
        <span style={{ minWidth: 40, textAlign: 'right' }}>Avg</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ ...rowStyle(r.isMe), fontVariantNumeric: 'tabular-nums' }}>
          <span className="dim" style={{ minWidth: 24 }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name}
            {r.isMe && <span className="dim"> (you)</span>}
          </span>
          <span style={{ minWidth: 40, textAlign: 'right' }}>{r.wins}</span>
          <span style={{ minWidth: 44, textAlign: 'right' }}>{Math.round(r.winRate * 100)}%</span>
          <span style={{ minWidth: 40, textAlign: 'right' }}>{r.games}</span>
          <span style={{ minWidth: 40, textAlign: 'right' }}>{r.avgPlace}</span>
        </div>
      ))}
    </section>
  );
}

export function History() {
  const [tab, setTab] = useState<Tab>('games');
  return (
    <div style={{ padding: 'calc(16px + var(--safe-t)) 16px 32px', display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 720, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn ghost" onClick={() => navigate('/')}>Home</button>
        <div style={{ flex: 1 }} />
        {(['games', 'leaderboard'] as const).map((t) => (
          <button key={t} className={`btn ${t === tab ? 'amber' : 'ghost'}`} onClick={() => setTab(t)}>
            {t === 'games' ? 'Games' : 'Leaderboard'}
          </button>
        ))}
      </div>
      {tab === 'games' ? <Games /> : <Leaderboard />}
    </div>
  );
}
