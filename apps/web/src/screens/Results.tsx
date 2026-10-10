import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { GameView, RoomView } from '@judgement/engine';
import { useRoom } from '../net/room';
import { initialOf, seatNames } from '../game/seats';
import { cap, joinNames, storyLine } from '../game/narrate';
import { rankOrder, Scoreboard, signed } from './Scoreboard';
import { Icon } from '../ui/icons';
import { shareOrCopy } from '../lib/share';

const OUT = [0.2, 0.8, 0.2, 1] as const;

/** 11 · Final results. */
export function Results({ room, game }: { room: RoomView; game: GameView }) {
  const send = useRoom((s) => s.send);
  const [scores, setScores] = useState(false);
  const [copied, setCopied] = useState(false);
  const names = seatNames(room, game);
  const order = rankOrder(game.totals);
  const top = game.totals[order[0]];
  const winners = order.filter((s) => game.totals[s] === top);
  const rounds = game.history.length;
  const exact = (s: number) => game.history.filter((h) => h.bids[s] === h.won[s]).length;
  const rank = (s: number) => order.findIndex((x) => game.totals[x] === game.totals[s]) + 1;
  const tied = (s: number) => order.filter((x) => game.totals[x] === game.totals[s]).length > 1;
  const meWon = game.me !== null && winners.includes(game.me);

  const headline =
    winners.length > 1
      ? meWon
        ? 'You tie for the win'
        : `${joinNames(winners.map((s) => names[s]))} tie`
      : meWon
        ? 'You win'
        : `${names[winners[0]]} wins`;

  const share = async () => {
    const lines = order.map((s) => `${rank(s)}. ${room.members[s].name} ${signed(game.totals[s])}`).join('\n');
    const text = `Judgement · ${rounds} rounds\n${lines}`;
    const r = await shareOrCopy({ title: 'Judgement results', text });
    if (r === 'copied') {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } else if (r === 'failed') window.prompt('Copy your results', text);
  };

  return (
    <motion.main className="scr" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      {meWon && <Confetti />}
      <div className="scroll" style={{ flex: '1 1 auto' }}>
        <header style={{ padding: '26px 20px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="k">
            Game over · {rounds} {rounds === 1 ? 'round' : 'rounds'}
            {room.endedEarly ? ' · ended early' : ''}
          </div>
          <motion.h1 initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.4, ease: OUT }} style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
            {headline}
            <span className="mono" style={{ color: 'var(--amber)', fontSize: 34, fontWeight: 500, letterSpacing: 0 }}>
              {top}
            </span>
          </motion.h1>
          <div className="dim" style={{ fontSize: 15, lineHeight: 1.4 }}>
            {cap(storyLine(game.history, names))}
          </div>
        </header>
        {rounds > 0 && <Race game={game} names={names} order={order} />}
        <div className="k" style={{ display: 'flex', padding: '18px 24px 6px', gap: 10 }}>
          <span style={{ flex: 1 }} />
          <span style={{ width: 54, textAlign: 'right' }}>Exact</span>
          <span style={{ width: 44, textAlign: 'right' }}>Pts</span>
        </div>
        <section style={{ margin: '0 12px', display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 12 }}>
          {order.map((s, i) => (
            <motion.div
              key={s}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
              style={{ height: 48, display: 'grid', gridTemplateColumns: '24px 30px minmax(0,1fr) 54px 44px', gap: 10, alignItems: 'center', padding: '0 12px', borderRadius: 12, background: s === game.me ? '#1A1E26' : undefined }}
            >
              <span className="mono dim" style={{ fontSize: 13 }}>
                {tied(s) && rank(s) > 1 ? `=${rank(s)}` : rank(s)}
              </span>
              <span className={`av-s${s === game.me ? ' me' : ''}`}>{s === game.me ? 'Y' : initialOf(names[s])}</span>
              <span style={{ fontSize: 16, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', gap: 6, alignItems: 'center' }}>
                {names[s]}
                {room.members[s]?.isBot && <span className="bot-tag">BOT</span>}
              </span>
              <span className="mono dim" style={{ fontSize: 12, textAlign: 'right' }}>
                {exact(s)}/{rounds}
              </span>
              <span className="mono" style={{ fontSize: 19, fontWeight: 500, textAlign: 'right' }}>
                {signed(game.totals[s])}
              </span>
            </motion.div>
          ))}
        </section>
      </div>
      <div style={{ padding: '12px 12px calc(16px + var(--safe-b))', display: 'flex', gap: 8, flex: 'none' }}>
        <button className="btn surf" style={{ width: 52, padding: 0, color: 'var(--text-2)' }} aria-label="Full scoreboard" onClick={() => setScores(true)}>
          <Icon.Scores size={22} />
        </button>
        <button className="btn surf" style={{ flex: '0 0 88px', padding: 0 }} onClick={share}>
          {copied ? 'Copied' : 'Share'}
        </button>
        <button className="btn amber" style={{ flex: 1 }} onClick={() => send({ type: 'rematch' })}>
          Rematch, same room
        </button>
      </div>
      <AnimatePresence>{scores && <Scoreboard room={room} game={game} onClose={() => setScores(false)} />}</AnimatePresence>
    </motion.main>
  );
}

function Race({ game, names, order }: { game: GameView; names: string[]; order: number[] }) {
  const W = 342;
  const H = 150;
  const series = useMemo(() => {
    return Array.from({ length: game.n }, (_, s) => {
      let t = 0;
      return [0, ...game.history.map((h) => (t += h.points[s]))];
    });
  }, [game]);
  const max = Math.max(10, ...series.flat());
  // High stakes can push totals below zero.
  const min = Math.min(0, ...series.flat());
  const rounds = game.history.length;
  const x = (i: number) => (i / Math.max(1, rounds)) * (W - 8) + 4;
  const y = (v: number) => H - 8 - ((v - min) / (max - min)) * (H - 24);
  const me = game.me;
  const rival = order.find((s) => s !== me) ?? order[0];
  const colour = (s: number) => (s === me ? 'var(--amber)' : s === rival ? 'var(--blue)' : '#4A505B');
  const draw = [...series.keys()].sort((a, b) => (a === me ? 1 : b === me ? -1 : a === rival ? 1 : b === rival ? -1 : 0));
  const mid = Math.round(max / 2 / 5) * 5;

  return (
    <section style={{ margin: '20px 12px 0', padding: '16px 12px 12px', borderRadius: 20, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', padding: '0 4px' }}>
        <span className="k">The race</span>
        <span className="k" style={{ marginLeft: 'auto' }}>
          Round 1 → {rounds}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Running totals by round. ${names[order[0]]} finishes on ${game.totals[order[0]]}.`}>
        <line x1="0" x2={W} y1={y(mid)} y2={y(mid)} stroke="#2C313B" strokeDasharray="3 4" />
        <text x="2" y={y(mid) - 4} fill="#6B717D" fontSize="10" fontFamily="DM Mono, monospace">
          {mid}
        </text>
        <line x1="0" x2={W} y1={y(0)} y2={y(0)} stroke="#2C313B" />
        {draw.map((s) => {
          const pts = series[s].map((v, i) => `${x(i)},${y(v)}`).join(' ');
          return (
            <motion.polyline
              key={s}
              points={pts}
              fill="none"
              stroke={colour(s)}
              strokeWidth={s === me || s === rival ? 2.5 : 1.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: OUT, delay: 0.2 }}
            />
          );
        })}
        {me !== null && <motion.circle cx={x(rounds)} cy={y(series[me][rounds])} r="4" fill="var(--amber)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1.2 }} />}
      </svg>
      <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--text-dim)', padding: '0 4px', flexWrap: 'wrap' }}>
        {me !== null && <LegendLine colour="var(--amber)" text="You" />}
        <LegendLine colour="var(--blue)" text={`${names[rival]}${order[0] === rival ? ', 1st' : order[1] === rival ? ', 2nd' : ''}`} />
        {game.n > 2 && <LegendLine colour="#4A505B" text="Others" />}
      </div>
    </section>
  );
}

function LegendLine({ colour, text }: { colour: string; text: string }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <i style={{ width: 14, height: 3, borderRadius: 2, background: colour, display: 'block' }} />
      {text}
    </span>
  );
}

/** Small burst of particles for the winner. Canvas, skipped with reduced motion. */
function Confetti() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduced')) {
      setOn(false);
      return;
    }
    const t = setTimeout(() => setOn(false), 2600);
    return () => clearTimeout(t);
  }, []);
  if (!on) return null;
  return <ConfettiCanvas />;
}

function ConfettiCanvas() {
  const [el, setEl] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = (el.width = el.clientWidth * dpr);
    const h = (el.height = el.clientHeight * dpr);
    const colours = ['#F2B544', '#7CC4F5', '#EEF0F3', '#FF8A7A'];
    const parts = Array.from({ length: 90 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * w * 0.3,
      y: h * 0.28,
      vx: (Math.random() - 0.5) * 9 * dpr,
      vy: (-Math.random() * 9 - 4) * dpr,
      s: (3 + Math.random() * 4) * dpr,
      r: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      c: colours[Math.floor(Math.random() * colours.length)],
    }));
    let raf = 0;
    const start = performance.now();
    const frame = (t: number) => {
      const age = (t - start) / 2400;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.28 * dpr;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - age);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      }
      if (age < 1) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [el]);
  return <canvas ref={setEl} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 30 }} />;
}
