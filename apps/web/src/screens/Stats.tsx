import { useCallback, useEffect, useState } from 'react';
import { load, save } from '../lib/storage';
import { navigate } from '../lib/router';

const TOKEN_KEY = 'judgement.statsToken';

interface Stats {
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

const RANGES = [7, 30, 90];
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '–');
const minutes = (ms: number | null) => (ms === null ? '–' : `${Math.round(ms / 60_000)} min`);

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div style={{ background: 'var(--surface-1)', borderRadius: 16, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span className="k">{label}</span>
      <span style={{ fontSize: 28, fontWeight: 700 }}>{value}</span>
      {sub && <span style={{ color: 'var(--text-dim)', fontSize: 13 }}>{sub}</span>}
    </div>
  );
}

function DailyChart({ daily }: { daily: Stats['daily'] }) {
  if (!daily.length) return <p style={{ color: 'var(--text-dim)' }}>No games in this range yet.</p>;
  const max = Math.max(...daily.map((d) => d.started), 1);
  const w = 100 / daily.length;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: '100%', height: 140 }} role="img" aria-label="Games started per day">
      {daily.map((d, i) => {
        const h = (d.started / max) * 36;
        const done = (d.completed / max) * 36;
        return (
          <g key={d.day}>
            <title>{`${d.day}: ${d.started} started, ${d.completed} completed, ${d.abandoned} abandoned`}</title>
            <rect x={i * w + w * 0.12} y={40 - h} width={w * 0.76} height={h} fill="var(--surface-2)" />
            <rect x={i * w + w * 0.12} y={40 - done} width={w * 0.76} height={done} fill="var(--amber)" />
          </g>
        );
      })}
    </svg>
  );
}

export function Stats() {
  const [token, setToken] = useState(load(TOKEN_KEY) ?? '');
  const [draft, setDraft] = useState('');
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    if (!token) return;
    setError(null);
    try {
      const res = await fetch(`/api/stats?days=${days}`, { headers: { authorization: `Bearer ${token}` } });
      if (res.status === 401) {
        save(TOKEN_KEY, '');
        setToken('');
        setError('Wrong token.');
        return;
      }
      if (!res.ok) throw new Error();
      setData((await res.json()) as Stats);
    } catch {
      setError('Couldn’t load stats.');
    }
  }, [token, days]);

  useEffect(() => {
    void fetchStats();
  }, [fetchStats]);

  if (!token) {
    return (
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 420, margin: '0 auto' }}>
        <span className="k">Stats token</span>
        <input className="field" type="password" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        {error && <span style={{ color: 'var(--coral)' }}>{error}</span>}
        <button
          className="btn amber"
          disabled={!draft}
          onClick={() => {
            save(TOKEN_KEY, draft);
            setToken(draft);
          }}
        >
          Show stats
        </button>
      </div>
    );
  }

  const t = data?.totals;
  const finished = t ? t.completed + t.endedEarly + t.abandoned : 0;
  return (
    <div style={{ padding: 'calc(16px + var(--safe-t)) 16px 32px', display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, margin: '0 auto', overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn ghost" onClick={() => navigate('/')}>Home</button>
        <div style={{ flex: 1 }} />
        {RANGES.map((r) => (
          <button key={r} className={`btn ${r === days ? 'amber' : 'ghost'}`} onClick={() => setDays(r)}>
            {r}d
          </button>
        ))}
      </div>
      {error && <span style={{ color: 'var(--coral)' }}>{error}</span>}
      {t && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
            <Tile label="Games started" value={t.games} sub={`${t.rooms} rooms created`} />
            <Tile label="Completed" value={t.completed} sub={`${pct(t.completed, finished)} of finished`} />
            <Tile label="Abandoned" value={t.abandoned} sub={`${t.endedEarly} ended early`} />
            <Tile label="Unique players" value={t.uniquePlayers} />
            <Tile label="Avg game length" value={minutes(t.avgDurationMs)} sub="completed games" />
          </div>
          <section>
            <span className="k">Games per day (amber = completed)</span>
            <DailyChart daily={data.daily} />
          </section>
          <section style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="k">Table makeup</span>
            {data.byPlayers.map((p) => (
              <div key={`${p.humans}-${p.bots}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{p.humans} human{p.humans === 1 ? '' : 's'} + {p.bots} bot{p.bots === 1 ? '' : 's'}</span>
                <span style={{ color: 'var(--text-dim)' }}>{p.games}</span>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
