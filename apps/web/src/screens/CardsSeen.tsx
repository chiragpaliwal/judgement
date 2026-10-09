import {
  fullDeck,
  openTrick,
  rankLabel,
  RANKS,
  suitOf,
  suitOrder,
  voids,
  type Card,
  type GameView,
  type RoomView,
  type Suit,
} from '@judgement/engine';
import { MiniCard } from '../ui/Card';
import { SuitIcon } from '../ui/icons';
import { seatNames } from '../game/seats';
import { Sheet } from './Sheet';

const short = (name: string) => (name === 'You' ? 'You' : name.replace(/^Bot\s+/i, '').slice(0, 2));

export function CardsSeen({ room, game, onClose }: { room: RoomView; game: GameView; onClose: () => void }) {
  const r = game.round;
  const names = seatNames(room, game);
  const mine = new Set(r.hand);
  const open = openTrick(r);
  const now = new Map<Card, number>((open?.plays ?? []).map((p) => [p.card, p.seat]));
  const played = new Map<Card, number>();
  for (const t of r.tricks) if (t.winner !== null) for (const p of t.plays) played.set(p.card, p.seat);
  const order = suitOrder(r.trump);
  const ranks = [...RANKS].reverse();
  const unseen = (s: Suit) => fullDeck().filter((c) => suitOf(c) === s && !mine.has(c) && !now.has(c) && !played.has(c)).length;
  const outOf = voids(r.tricks, game.n);
  const done = r.tricks.filter((t) => t.winner !== null);

  return (
    <Sheet title="Cards seen" sub={`Round ${r.index + 1} · after ${r.tricksDone} trick${r.tricksDone === 1 ? '' : 's'}`} onClose={onClose} label="Cards seen this round">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
        {order.map((s) => (
          <div key={s} style={{ background: 'var(--surface-2)', borderRadius: 12, padding: '10px 10px 9px', display: 'flex', flexDirection: 'column', gap: 3 }}>
            <SuitIcon suit={s} dark style={{ width: 16, height: 16 }} />
            <span className="mono" style={{ fontSize: 20, fontWeight: 500 }}>
              {unseen(s)}
            </span>
            <span className="k">{s === r.trump ? 'Trump unseen' : 'Unseen'}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }} role="table" aria-label="All 52 cards">
        <div style={{ display: 'grid', gridTemplateColumns: '22px repeat(13, minmax(0, 1fr))', gap: 2 }}>
          <span />
          {ranks.map((rk) => (
            <span key={rk} className="mono" style={{ fontSize: 10, color: '#7E8592', textAlign: 'center' }}>
              {rk === 'T' ? '10' : rk}
            </span>
          ))}
        </div>
        {order.map((s) => (
          <div key={s} style={{ display: 'grid', gridTemplateColumns: '22px repeat(13, minmax(0, 1fr))', gap: 2, alignItems: 'center' }} role="row">
            <SuitIcon suit={s} dark style={{ width: 16, height: 16, display: 'block', margin: '0 auto' }} />
            {ranks.map((rk) => {
              const c = `${rk}${s}` as Card;
              const base = { height: 36, borderRadius: 5, display: 'flex', flexDirection: 'column' as const, alignItems: 'center', justifyContent: 'center', gap: 1, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 500 };
              if (mine.has(c))
                return (
                  <span key={c} role="cell" aria-label={`${rankLabel(c)} yours`} style={{ ...base, background: 'var(--card)', color: 'var(--suit-s)', boxShadow: '0 0 0 1.5px var(--amber)' }}>
                    {rankLabel(c)}
                  </span>
                );
              if (now.has(c))
                return (
                  <span key={c} role="cell" aria-label={`${rankLabel(c)} on the table`} style={{ ...base, color: 'var(--blue)', boxShadow: 'inset 0 0 0 1.5px var(--blue)' }}>
                    {rankLabel(c)}
                    <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 600 }}>{short(names[now.get(c)!])}</span>
                  </span>
                );
              if (played.has(c))
                return (
                  <span key={c} role="cell" aria-label={`${rankLabel(c)} played by ${names[played.get(c)!]}`} style={{ ...base, color: '#5A606B', boxShadow: 'inset 0 0 0 1px #262B34' }}>
                    <span style={{ textDecoration: 'line-through' }}>{rankLabel(c)}</span>
                    <span style={{ fontFamily: 'var(--font)', fontSize: 9, fontWeight: 600, color: '#7E8592' }}>{short(names[played.get(c)!])}</span>
                  </span>
                );
              return (
                <span key={c} role="cell" aria-label={`${rankLabel(c)} not seen`} style={{ ...base, background: 'var(--surface-2)', color: 'var(--text-2)' }}>
                  {rankLabel(c)}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-dim)' }}>
        <Legend style={{ background: 'var(--card)', boxShadow: '0 0 0 1.5px var(--amber)' }} text="Yours" />
        <Legend style={{ boxShadow: 'inset 0 0 0 1.5px var(--blue)' }} text="This trick" />
        <Legend style={{ boxShadow: 'inset 0 0 0 1px #3A404B' }} text="Played, with who" />
        <Legend style={{ background: 'var(--surface-2)' }} text="Not seen yet" />
      </div>

      {outOf.some((v) => v.length) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="k">Out of a suit</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {outOf.flatMap((v, seat) =>
              v.map((s) => (
                <span key={`${seat}${s}`} style={{ height: 30, padding: '0 10px', borderRadius: 15, background: 'var(--surface-2)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b>{names[seat]}</b>
                  <span className="dim">no</span>
                  <SuitIcon suit={s} dark style={{ width: 13, height: 13 }} />
                  {seat === game.me && <span className="dim">· everyone knows</span>}
                </span>
              )),
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div className="k">Tricks</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {done.map((t, i) => {
            const win = t.plays.find((p) => p.seat === t.winner)!;
            return (
              <div key={i} style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', borderRadius: 10, background: i % 2 === 0 ? '#1C2027' : 'transparent' }}>
                <span className="mono dim" style={{ width: 18 }}>
                  {r.firstTrickIndex + i + 1}
                </span>
                <b style={{ fontSize: 15 }}>{names[t.winner!]}</b>
                <span className="dim" style={{ fontSize: 13 }}>
                  led by {names[t.leader]}
                </span>
                <span style={{ flex: 1 }} />
                <MiniCard card={win.card} />
              </div>
            );
          })}
          {open && open.plays.length > 0 && (
            <div style={{ height: 40, display: 'flex', alignItems: 'center', gap: 10, padding: '0 10px', borderRadius: 10, background: done.length % 2 === 0 ? '#1C2027' : 'transparent' }}>
              <span className="mono dim" style={{ width: 18 }}>
                {r.tricksDone + 1}
              </span>
              <span className="dim" style={{ fontSize: 13 }}>
                in play · led by {names[open.leader]}
              </span>
            </div>
          )}
          {!done.length && !open?.plays.length && <span className="dim" style={{ fontSize: 13 }}>No tricks played yet.</span>}
        </div>
      </div>
    </Sheet>
  );
}

function Legend({ style, text }: { style: React.CSSProperties; text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <i style={{ width: 12, height: 12, borderRadius: 3, display: 'block', ...style }} />
      {text}
    </span>
  );
}
