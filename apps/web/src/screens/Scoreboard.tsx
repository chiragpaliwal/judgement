import { useState } from 'react';
import { motion } from 'motion/react';
import { scoreFor, trumpFor, type GameView, type RoomView } from '@judgement/engine';
import { SuitIcon } from '../ui/icons';
import { initialOf, seatNames } from '../game/seats';
import { Sheet } from './Sheet';

/** Typographic minus for negative scores. */
export const signed = (v: number) => (v < 0 ? `−${-v}` : `${v}`);

export function rankOrder(totals: number[]) {
  return totals.map((t, i) => i).sort((a, b) => totals[b] - totals[a] || a - b);
}

export function ScoreTable({ room, game }: { room: RoomView; game: GameView }) {
  const [mode, setMode] = useState<'pts' | 'bid'>('pts');
  const names = seatNames(room, game);
  const order = rankOrder(game.totals);
  const cols = `58px repeat(${game.n}, minmax(0, 1fr))`;
  const played = game.history.length;
  const exact = (seat: number) => game.history.filter((h) => h.bids[seat] === h.won[seat]).length;

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0 12px', gap: 10 }}>
        <div className="seg2" style={{ background: 'var(--surface-1)' }} role="tablist">
          <button className={mode === 'pts' ? 'on' : ''} role="tab" aria-selected={mode === 'pts'} onClick={() => setMode('pts')} style={{ padding: '0 14px' }}>
            Points
          </button>
          <button className={mode === 'bid' ? 'on' : ''} role="tab" aria-selected={mode === 'bid'} onClick={() => setMode('bid')} style={{ padding: '0 14px' }}>
            Bid · took
          </button>
        </div>
        <span className="dim" style={{ marginLeft: 'auto', fontSize: 13 }}>
          Misses in red
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: cols, columnGap: 2, padding: '8px 0 16px' }} role="table" aria-label="Scores by round">
        <div />
        {order.map((s) => (
          <div key={s} style={{ height: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingBottom: 8, background: s === game.me ? '#16191F' : undefined, minWidth: 0 }}>
            <span className={`av-s${s === game.me ? ' me' : ''}`} style={{ position: 'relative' }}>
              {s === game.me ? 'Y' : initialOf(names[s])}
              {room.members[s]?.isBot && <span className="bot-tag" style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 7, padding: '1px 3px' }}>BOT</span>}
            </span>
            <span style={{ fontSize: 11, fontWeight: 600, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '0 2px' }}>{names[s].replace(/^Bot\s+/i, '')}</span>
          </div>
        ))}
        {game.plan.map((cards, ri) => {
          const h = game.history[ri];
          const now = ri === game.round.index && !h;
          return [
            <div key={`l${ri}`} className="mono" style={{ height: 40, display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 12, fontSize: 12, color: now ? 'var(--amber)' : 'var(--text-dim)' }}>
              {cards}
              <SuitIcon suit={trumpFor(ri)} dark style={{ width: 12, height: 12 }} />
            </div>,
            ...order.map((s) => {
              const bg = s === game.me ? '#16191F' : undefined;
              if (!h)
                return (
                  <div key={`${ri}-${s}`} className="mono" style={{ height: 40, display: 'grid', placeItems: 'center', color: '#3A404B', fontSize: 12, background: bg }}>
                    {now && game.round.bids[s] !== null ? <span style={{ color: 'var(--text-dim)' }}>{game.round.won[s]}/{game.round.bids[s]}</span> : '·'}
                  </div>
                );
              const miss = h.bids[s] !== h.won[s];
              return (
                <div key={`${ri}-${s}`} className="mono" style={{ height: 40, display: 'grid', placeItems: 'center', fontSize: mode === 'pts' ? 15 : 13, color: miss ? 'var(--coral)' : undefined, opacity: miss ? 0.85 : 1, background: bg }}>
                  {mode === 'pts' ? signed(h.points[s]) : `${h.bids[s]}·${h.won[s]}`}
                </div>
              );
            }),
          ];
        })}
        <div style={{ gridColumn: '1 / -1', height: 1, background: 'var(--line)', margin: '4px 0' }} />
        <div style={{ height: 52, display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 15, fontWeight: 600 }}>Total</div>
        {order.map((s) => (
          <div key={`t${s}`} className="mono" style={{ height: 52, display: 'grid', placeItems: 'center', fontSize: 19, fontWeight: 500, background: s === game.me ? '#16191F' : undefined }}>
            {signed(game.totals[s])}
          </div>
        ))}
        <div className="dim" style={{ height: 40, display: 'flex', alignItems: 'center', paddingLeft: 12, fontSize: 13 }}>
          Exact
        </div>
        {order.map((s) => (
          <div key={`e${s}`} className="mono dim" style={{ height: 40, display: 'grid', placeItems: 'center', fontSize: 13, background: s === game.me ? '#16191F' : undefined }}>
            {exact(s)}/{played}
          </div>
        ))}
      </div>
    </>
  );
}

export function Scoreboard({ room, game, onClose }: { room: RoomView; game: GameView; onClose: () => void }) {
  const names = seatNames(room, game);
  const order = rankOrder(game.totals);
  const lead = order[0];
  const max = Math.max(1, game.totals[lead]);
  const played = game.history.length;
  const remainingRounds = game.plan.slice(played);
  const maxLeft = remainingRounds.reduce((a, c) => a + scoreFor(c, c, game.settings.scoring), 0);

  return (
    <Sheet variant="full" title="Scores" sub={`after round ${played} of ${game.plan.length}`} onClose={onClose} label="Scoreboard">
      <section style={{ margin: '8px 12px 16px', padding: 16, borderRadius: 20, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span className="k">Leading</span>
          <b style={{ fontSize: 18 }}>{names[lead]}</b>
          <span className="mono" style={{ fontSize: 18 }}>
            {signed(game.totals[lead])}
          </span>
          <span className="dim" style={{ marginLeft: 'auto', fontSize: 12 }}>
            {remainingRounds.length ? `${remainingRounds.length} round${remainingRounds.length === 1 ? '' : 's'}, max ${maxLeft} left to win` : 'Final'}
          </span>
        </div>
        {order.map((s) => (
          <div key={s} style={{ display: 'grid', gridTemplateColumns: '64px 1fr 40px', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names[s]}</span>
            <span style={{ height: 6, borderRadius: 3, background: 'var(--surface-2)', overflow: 'hidden' }}>
              <motion.span
                style={{ display: 'block', height: '100%', borderRadius: 3, background: s === game.me ? 'var(--amber)' : '#5A606B' }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.max(0, game.totals[s] / max) * 100}%` }}
                transition={{ duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
              />
            </span>
            <span className="mono dim" style={{ textAlign: 'right' }}>
              {s === lead ? signed(game.totals[s]) : `−${game.totals[lead] - game.totals[s]}`}
            </span>
          </div>
        ))}
      </section>
      <ScoreTable room={room} game={game} />
    </Sheet>
  );
}
