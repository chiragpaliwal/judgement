import { useEffect, useState } from 'react';
import { AnimatePresence, animate, motion } from 'motion/react';
import { trumpFor, type GameView, type RoomView } from '@judgement/engine';
import { Icon, SuitIcon } from '../ui/icons';
import { serverNow, useRoom } from '../net/room';
import { usePrefs } from '../lib/prefs';
import { initialOf, seatNames } from '../game/seats';
import { recapHeadline, recapLine } from '../game/narrate';
import { ChatButton } from './Chat';
import { Scoreboard, signed } from './Scoreboard';

export function CountUp({ from, to, duration = 0.6, delay = 0 }: { from: number; to: number; duration?: number; delay?: number }) {
  const [v, setV] = useState(from);
  const reduced = usePrefs((s) => s.reducedMotion);
  useEffect(() => {
    if (reduced || from === to) {
      setV(to);
      return;
    }
    const c = animate(from, to, { duration, delay, ease: [0.2, 0.8, 0.2, 1], onUpdate: (x) => setV(Math.round(x)) });
    return () => c.stop();
  }, [from, to, duration, delay, reduced]);
  return <>{signed(v)}</>;
}

/** 09 · Round summary. */
export function RoundSummary({ room, game }: { room: RoomView; game: GameView }) {
  const send = useRoom((s) => s.send);
  const [scores, setScores] = useState(false);
  const [sorted, setSorted] = useState(false);
  const [, tick] = useState(0);
  const names = seatNames(room, game);
  const rec = game.history[game.history.length - 1];
  const prevTotals = game.totals.map((t, i) => t - rec.points[i]);
  const lastTrick = game.round.tricks[game.round.tricks.length - 1] ?? null;
  const { made, missed } = recapHeadline(rec);
  const nextIndex = rec.index + 1;
  const next = nextIndex < game.plan.length ? { cards: game.plan[nextIndex], trump: trumpFor(nextIndex), dealer: (rec.dealer + 1) % game.n } : null;
  const youReady = !!room.you && room.ready.includes(room.you);
  const humans = room.members;
  const readyCount = humans.filter((m) => room.ready.includes(m.id)).length;
  const secs = room.autoDealAt ? Math.max(0, Math.ceil((room.autoDealAt - serverNow()) / 1000)) : null;

  useEffect(() => {
    const t = setTimeout(() => setSorted(true), 1100);
    const i = setInterval(() => tick((x) => x + 1), 500);
    return () => {
      clearTimeout(t);
      clearInterval(i);
    };
  }, []);

  const base = sorted ? game.totals : prevTotals;
  const order = base.map((_, i) => i).sort((a, b) => base[b] - base[a] || a - b);

  return (
    <motion.main className="scr" initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
      <div className="scroll" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column' }}>
        <header style={{ padding: '26px 20px 0', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div className="k">
            Round {rec.index + 1} of {game.plan.length} · {rec.cards} {rec.cards === 1 ? 'card' : 'cards'}
          </div>
          <h1 style={{ fontSize: 34, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.05 }}>
            {made === 0 ? 'Nobody made it.' : `${made} made it.`}
            {missed > 0 && (
              <>
                <br />
                <span style={{ color: 'var(--coral)' }}>{missed === game.n ? 'Everyone missed.' : `${missed} missed.`}</span>
              </>
            )}
          </h1>
          <div className="dim" style={{ fontSize: 14, lineHeight: 1.4, marginTop: 4 }}>
            {recapLine(rec, names, lastTrick)}
          </div>
        </header>
        <div className="k" style={{ display: 'flex', padding: '22px 24px 6px', gap: 12 }}>
          <span style={{ flex: 1, paddingLeft: 44 }}>Bid · took</span>
          <span style={{ width: 92, textAlign: 'right' }}>Round</span>
          <span style={{ width: 44, textAlign: 'right' }}>Total</span>
        </div>
        <section style={{ margin: '0 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {order.map((s, i) => {
            const ok = rec.bids[s] === rec.won[s];
            return (
              <motion.div
                layout
                key={s}
                transition={{ layout: { duration: 0.4, delay: i * 0.03, ease: [0.2, 0.8, 0.2, 1] } }}
                style={{ height: 58, display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) 92px 44px', alignItems: 'center', gap: 12, padding: '0 12px', borderRadius: 12, background: s === game.me ? '#1A1E26' : undefined }}
              >
                <span className={`av-s${s === game.me ? ' me' : ''}`} style={{ width: 32, height: 32, fontSize: 13 }}>
                  {s === game.me ? 'Y' : initialOf(names[s])}
                </span>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                  <span style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{names[s]}</span>
                  <span className="mono dim" style={{ fontSize: 12 }}>
                    bid {rec.bids[s]} · took {rec.won[s]}
                  </span>
                </div>
                <motion.span
                  className="mono"
                  style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 6, height: 30, padding: '0 10px', borderRadius: 9, fontSize: 15, fontWeight: 500, background: ok ? '#15293A' : '#2D1A18', color: ok ? 'var(--blue)' : 'var(--coral)' }}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.25 + i * 0.03, duration: 0.2 }}
                >
                  {ok ? <Icon.Check size={14} /> : <Icon.X size={14} />}
                  {ok ? <>+<CountUp from={0} to={rec.points[s]} delay={0.3} /></> : rec.points[s] < 0 ? <CountUp from={0} to={rec.points[s]} delay={0.3} /> : '0'}
                </motion.span>
                <span className="mono" style={{ fontSize: 17, textAlign: 'right' }}>
                  <CountUp from={prevTotals[s]} to={game.totals[s]} delay={0.3} />
                </span>
              </motion.div>
            );
          })}
        </section>

        <div style={{ flex: 1, minHeight: 16 }} />
        {next && (
          <section style={{ margin: '0 12px', padding: 14, borderRadius: 16, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>
                Next · {next.cards} {next.cards === 1 ? 'card' : 'cards'}
              </div>
              <span className="trchip" style={{ height: 28 }}>
                <SuitIcon suit={next.trump} style={{ width: 15, height: 15 }} />
                <span>Trump</span>
              </span>
              <div className="dim" style={{ marginLeft: 'auto', fontSize: 13, whiteSpace: 'nowrap' }}>
                {names[next.dealer] === 'You' ? 'You deal' : `${names[next.dealer]} deals`}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                {room.members.map((m, i) => (
                  <span key={m.id} className="av-s" style={{ width: 28, height: 28, fontSize: 11, boxShadow: room.ready.includes(m.id) ? '0 0 0 2px var(--blue)' : undefined, transition: 'box-shadow .2s' }}>
                    {i === game.me ? 'Y' : initialOf(m.name)}
                  </span>
                ))}
              </div>
              <div className="dim" style={{ fontSize: 12 }}>
                {readyCount} of {humans.length} ready{secs !== null ? ` · deals in ${secs}s` : ''}
              </div>
            </div>
          </section>
        )}
      </div>
      <div style={{ padding: '12px 12px calc(16px + var(--safe-b))', display: 'flex', gap: 8, flex: 'none' }}>
        <ChatButton className="btn surf" style={{ width: 52, padding: 0, color: 'var(--text-2)', flex: 'none' }} />
        <button className="btn surf" style={{ width: 52, height: 54, padding: 0, color: 'var(--text-2)' }} aria-label="Full scoreboard" onClick={() => setScores(true)}>
          <Icon.Scores size={22} />
        </button>
        <button className={`btn ${youReady ? 'ghost' : 'amber'}`} style={{ flex: 1, height: 54 }} disabled={youReady} onClick={() => send({ type: 'ready' })}>
          {youReady ? 'Waiting for the others…' : 'Ready'}
        </button>
      </div>
      <AnimatePresence>{scores && <Scoreboard room={room} game={game} onClose={() => setScores(false)} />}</AnimatePresence>
    </motion.main>
  );
}
