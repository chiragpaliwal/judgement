import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  bidTotal,
  cardName,
  hookedBid,
  openTrick,
  tableNeeds,
  winningIndex,
  type GameView,
  type RoomView,
  type Trick,
} from '@judgement/engine';
import { CardFace } from '../ui/Card';
import { Icon } from '../ui/icons';
import { usePrefs } from '../lib/prefs';
import { serverNow, useRoom } from '../net/room';
import { placePill, relSeat, tableLayout, type Point } from './geometry';
import { bidNote, joinNames } from './narrate';
import { buildSeats, seatNames, type SeatModel } from './seats';

const OUT = [0.2, 0.8, 0.2, 1] as const;

export function Table({
  room,
  game,
  pendingBid,
  compact,
  small,
}: {
  room: RoomView;
  game: GameView;
  pendingBid: number | null;
  compact: boolean;
  /** Allow the table to shrink further (e.g. while the bid sheet is open). */
  small?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const held = useRoom((s) => s.held);
  const reactions = useRoom((s) => s.reactions);
  const reduced = usePrefs((s) => s.reducedMotion);
  const [showLast, setShowLast] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!showLast) return;
    const t = setTimeout(() => setShowLast(false), 3000);
    return () => clearTimeout(t);
  }, [showLast]);

  const n = game.n;
  const me = game.me;
  const r = game.round;
  const playingLayout = game.phase !== 'bidding';
  const L = useMemo(() => tableLayout(n, size.w, size.h, compact, playingLayout), [n, size.w, size.h, compact, playingLayout]);
  const seats = buildSeats(room, game, pendingBid, !!held);
  const names = seatNames(room, game);
  const pos = (seat: number) => L.seats[relSeat(seat, me, n)];
  const cardPos = (seat: number) => L.cards[relSeat(seat, me, n)];

  const completed = r.tricks.filter((t) => t.winner !== null);
  const lastDone: Trick | null = completed[completed.length - 1] ?? null;
  const open = openTrick(r);

  let shownTrick: Trick | null = null;
  let mode: 'live' | 'held' | 'replay' = 'live';
  if (held) {
    shownTrick = held.trick;
    mode = 'held';
  } else if (showLast && lastDone) {
    shownTrick = lastDone;
    mode = 'replay';
  } else shownTrick = open;
  const plays = shownTrick?.plays ?? [];
  const winSeat = shownTrick && plays.length ? (shownTrick.winner ?? plays[winningIndex(plays, r.trump)].seat) : null;
  const hookActive = game.phase === 'bidding' && r.turn === me && me === r.dealer && hookedBid(r, me) !== null && !room.pause;
  const playing = game.phase === 'playing';
  const ready = size.w > 0;

  // Slot placeholders: your dashed slot, or the breathing slot of whoever is choosing.
  const slotSeat = playing && mode === 'live' && !room.pause && !plays.some((p) => p.seat === r.turn) ? r.turn : null;
  const winnerPos = winSeat !== null ? pos(winSeat) : L.centre;

  return (
    <section ref={ref} className={`tbl${n <= 4 || small ? ' small' : ''}`} aria-label="Table">
      <div className={`felt${hookActive ? ' hook' : ''}`} />
      {ready && (
        <>
          <CenterPill room={room} game={game} names={names} pendingBid={pendingBid} band={L.pill} centre={L.centre} mode={mode} held={!!held} replayWinner={mode === 'replay' ? winSeat : null} />

          {slotSeat !== null && (
            <div
              className={`tc ${slotSeat === me ? 'ghost' : 'think hot'}`}
              style={{ left: cardPos(slotSeat).x - (compact ? 21 : 23), top: cardPos(slotSeat).y - (compact ? 29 : 32), transform: `rotate(${cardPos(slotSeat).rot}deg)` }}
              role="img"
              aria-label={slotSeat === me ? 'Your card goes here' : `${names[slotSeat]} is choosing`}
            />
          )}

          <AnimatePresence custom={winnerPos}>
            {plays.map((p, i) => {
              const c = cardPos(p.seat);
              const from = p.seat === me ? { x: L.seats[0].x, y: size.h + 60 } : pos(p.seat);
              const w = compact ? 42 : 46;
              const h = compact ? 58 : 64;
              return (
                <motion.div
                  key={`${mode}-${p.card}`}
                  className="tc"
                  style={{ left: c.x - w / 2, top: c.y - h / 2, zIndex: 1 + i }}
                  custom={winnerPos}
                  initial={
                    reduced || mode === 'replay'
                      ? { opacity: 0, rotate: c.rot }
                      : { x: from.x - c.x, y: from.y - c.y, scale: p.seat === me ? 1.5 : 0.5, opacity: 0, rotate: c.rot }
                  }
                  animate={{ x: 0, y: 0, scale: 1, opacity: 1, rotate: c.rot }}
                  exit={
                    mode === 'replay' || reduced
                      ? { opacity: 0, transition: { duration: 0.12 } }
                      : { x: winnerPos.x - c.x, y: winnerPos.y - c.y, scale: 0.3, opacity: 0, transition: { duration: 0.3, ease: OUT } }
                  }
                  transition={reduced ? { duration: 0.12 } : { duration: p.seat === me ? 0.26 : 0.22, ease: OUT }}
                  role="img"
                  aria-label={`${names[p.seat]} played ${cardName(p.card)}`}
                >
                  <CardFace card={p.card} trump={r.trump} win={p.seat === winSeat} />
                  {i === 0 && <span className="ldtag">led</span>}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {seats.map((s) => (
            <Seat
              key={s.id}
              model={s}
              at={pos(s.seat)}
              side={L.topSide && relSeat(s.seat, me, n) === n / 2}
              compact={compact}
              deadline={s.turn ? room.turnDeadline : null}
              timerTotal={room.settings.turnTimer * 1000}
              reaction={reactions.filter((x) => x.from === s.id).slice(-1)[0] ?? null}
              reduced={reduced}
            />
          ))}

          {playing && lastDone && !held && game.settings && (
            <button className="lt" onClick={() => setShowLast((v) => !v)} aria-label="Show the last trick" aria-pressed={showLast}>
              <Icon.Undo />
              {showLast ? 'Back to play' : 'Last trick'}
            </button>
          )}
        </>
      )}
    </section>
  );
}

function Seat({
  model: s,
  at,
  side,
  compact,
  deadline,
  timerTotal,
  reaction,
  reduced,
}: {
  model: SeatModel;
  at: Point;
  /** Name and pips beside the avatar instead of under it (short tables, seat straight across). */
  side: boolean;
  compact: boolean;
  deadline: number | null;
  timerTotal: number;
  reaction: { id: number; emoji: string } | null;
  reduced: boolean;
}) {
  const r = compact ? 19 : 21;
  const cls = ['seat', side && 'side', s.me && 'me', s.turn && 'turn', s.alive && 'alive', s.out && 'out', s.away && 'away'].filter(Boolean).join(' ');
  const label = `${s.name}${s.dealer ? ', dealer' : ''}${s.leads ? ', leads first' : ''}${s.badge.kind === 'need' ? `, needs ${s.badge.text}` : ''}${s.out ? ', out' : ''}${s.tag ? `, ${s.tag.text}` : ''}`;
  return (
    <motion.div
      className={cls}
      style={{ left: at.x, top: at.y - r }}
      animate={s.out && !reduced ? { x: [0, -2, 2, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.18 }}
      aria-label={label}
    >
      <div className="av">
        {s.initial}
        {deadline !== null && timerTotal > 0 && <TimerRing deadline={deadline} total={timerTotal} size={r * 2 + 12} />}
        <AnimatePresence initial={false} mode="popLayout">
          {s.badge.kind !== 'none' && (
            <motion.span
              key={s.badge.kind + s.badge.text}
              className={`nb ${s.badge.kind === 'need' ? '' : s.badge.kind}`}
              initial={reduced ? { opacity: 0 } : { y: -6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.08 } }}
              transition={{ duration: 0.15 }}
            >
              {s.badge.text}
            </motion.span>
          )}
        </AnimatePresence>
        {s.dealer && <span className="dl">D</span>}
        {s.leads && (
          <span className="ldr" title="Leads the first trick">
            1st
          </span>
        )}
        {s.away && (
          <span className="offl" title="Offline">
            <Icon.Offline />
          </span>
        )}
        <AnimatePresence>
          {reaction && (
            <motion.span
              key={reaction.id}
              className="bub"
              initial={{ x: '-50%', y: 6, scale: 0.7, opacity: 0 }}
              animate={{ x: '-50%', y: [6, 0, 0, -10], scale: [0.7, 1, 1, 1], opacity: [0, 1, 1, 0] }}
              transition={{ duration: 2.4, times: [0, 0.12, 0.75, 1] }}
            >
              {reaction.emoji}
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <div className="lab">
        <span className="nm">{s.name}</span>
        <div className="pips">
          {Array.isArray(s.pips) ? (
            s.pips.map((p, i) => <i key={i} className={`pip ${p}`} />)
          ) : (
            <span className="meter">
              <i>
                <b style={{ width: `${(Math.min(s.pips.won, s.pips.bid) / s.pips.bid) * 100}%` }} />
              </i>
              {s.pips.won}/{s.pips.bid}
            </span>
          )}
          {s.tag && <span className={`stx ${s.tag.tone === 'blue' ? '' : s.tag.tone === 'dim' ? 'dimt' : s.tag.tone}`}>{s.tag.text}</span>}
          {s.autoplay && !s.tag && <span className="stx dimt">auto</span>}
        </div>
      </div>
    </motion.div>
  );
}

function TimerRing({ deadline, total, size }: { deadline: number; total: number; size: number }) {
  const remaining = Math.max(0, deadline - serverNow());
  const radius = size / 2 - 2;
  const len = 2 * Math.PI * radius;
  const startFrac = Math.min(1, remaining / total);
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ inset: -6 }} aria-hidden key={deadline}>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        strokeDasharray={len}
        style={{
          strokeDashoffset: len * (1 - startFrac),
          animation: `deplete-${Math.round(len)} ${remaining}ms linear forwards`,
        }}
      />
      <style>{`@keyframes deplete-${Math.round(len)} { to { stroke-dashoffset: ${len}; } }`}</style>
    </svg>
  );
}

// Approximate line heights of the pill's stack (see .pill in styles.css), for fitting it between seats.
const LINE_H = { lbl: 13, c: 21, bar: 5, t: 14, dots: 7 };
type Line = keyof typeof LINE_H;

/** Drops lines in `drop` order until the stack fits `room`; whatever is left in `want` stays. */
function fitLines(want: Line[], drop: Line[], room: number) {
  const shown = new Set(want);
  const height = () => [...shown].reduce((a, k) => a + LINE_H[k], 0) + 4 * (shown.size - 1);
  for (const k of drop) {
    if (height() <= room) break;
    shown.delete(k);
  }
  return { has: (k: Line) => shown.has(k), h: height() };
}

function CenterPill({
  room,
  game,
  names,
  pendingBid,
  band,
  centre,
  mode,
  held,
  replayWinner,
}: {
  room: RoomView;
  game: GameView;
  names: string[];
  pendingBid: number | null;
  band: { top: number; bottom: number };
  centre: Point;
  mode: 'live' | 'held' | 'replay';
  held: boolean;
  replayWinner: number | null;
}) {
  const r = game.round;
  const me = game.me;
  const space = band.bottom - band.top;
  const at = (h: number) => ({ left: centre.x, top: placePill(band, centre.y, h) });

  if (mode === 'replay' && replayWinner !== null) {
    const idx = r.tricksDone;
    const fit = fitLines(['lbl', 'c'], ['lbl'], space);
    return (
      <div className="pill" style={at(fit.h)} aria-live="polite">
        {fit.has('lbl') && <span className="lbl">Trick {idx}</span>}
        <span className="c even">{names[replayWinner] === 'You' ? 'You took it' : `${names[replayWinner]} took it`}</span>
      </div>
    );
  }

  if (game.phase === 'bidding') {
    const total = bidTotal(r.bids);
    const myTurn = r.turn === me && !room.pause;
    const hook = myTurn && me === r.dealer ? hookedBid(r, me!) : null;
    const preview = myTurn && pendingBid !== null ? pendingBid : 0;
    const claimed = total + preview;
    const segs = Math.max(r.cards, claimed);
    const allBid = r.bids.filter((b) => b !== null).length;
    const lastRound = r.cards === 1 && r.index === game.plan.length - 1;

    let chip: { text: string; cls: string };
    if (hook !== null && pendingBid === null) chip = { text: 'On the hook', cls: 'short' };
    else if (myTurn && pendingBid !== null) {
      chip =
        claimed < r.cards
          ? { text: `${claimed} of ${r.cards} · ${r.cards - claimed} open`, cls: '' }
          : claimed === r.cards
            ? { text: `exactly ${r.cards}`, cls: '' }
            : { text: `${claimed - r.cards} over`, cls: 'short' };
    } else chip = { text: `${total} of ${r.cards} bid`, cls: '' };

    const note =
      hook !== null
        ? `${allBid} of ${game.n} bid · last bid is yours`
        : lastRound
          ? 'Last round · one trick decides it'
          : bidNote(game, names);

    const showLbl = !lastRound && hook === null && !myTurn;
    const showBar = r.cards > 1 && segs <= 24;
    const fit = fitLines(
      [showLbl && 'lbl', 'c', showBar && 'bar', 't'].filter((k): k is Line => !!k),
      ['lbl', 't', 'bar'],
      space,
    );

    return (
      <div className="pill" style={at(fit.h)} aria-live="polite">
        {fit.has('lbl') && <span className="lbl">Bidding</span>}
        <span className={`c ${chip.cls}`}>{chip.text}</span>
        {fit.has('bar') && (
          <span className="mbar" aria-hidden>
            {Array.from({ length: segs }, (_, i) => {
              let c = '';
              if (i < total) c = 'b';
              else if (i < claimed) c = 'p';
              if (i >= r.cards) c = 'x';
              if (hook !== null && pendingBid === null && i >= total && i < total + hook) c = 'h';
              return <i key={i} className={c} />;
            })}
          </span>
        )}
        {fit.has('t') && <span className="t">{note}</span>}
      </div>
    );
  }

  // Playing (also shown while the last trick of a round is held).
  const { needed, left: rawLeft } = tableNeeds(r);
  const left = rawLeft;
  const bal = needed - left;
  const lastTrick = game.phase === 'playing' && left === 1 && !held;
  const dots = Array.from({ length: r.cards }, (_, i) => {
    const done = i < r.tricksDone;
    const now = i === r.tricksDone && game.phase === 'playing';
    return <i key={i} className={done ? 'done' : now ? `now${lastTrick ? ' hot' : ''}` : ''} />;
  });

  if (lastTrick) {
    const alive = r.bids.map((_, i) => i).filter((i) => {
      const b = r.bids[i] ?? 0;
      return b - r.won[i] === 1;
    });
    const text =
      alive.length === 0
        ? 'Nobody needs it'
        : alive.length === 1
          ? `${names[alive[0]] === 'You' ? 'Yours' : `${names[alive[0]]}’s`} to take`
          : alive.length === 2
            ? `${joinNames(alive.map((i) => names[i]))} need it`
            : `${alive.length} need it`;
    const fit = fitLines(r.cards <= 17 ? ['lbl', 'c', 't', 'dots'] : ['lbl', 'c', 't'], ['dots', 't', 'lbl'], space);
    return (
      <div className="pill" style={at(fit.h)} aria-live="polite">
        {fit.has('lbl') && <span className="lbl hot">Last trick</span>}
        <span className="c short">{text}</span>
        {fit.has('t') && (
          <span className="t">
            {left} left · {needed} needed
          </span>
        )}
        {fit.has('dots') && <span className="dots">{dots}</span>}
      </div>
    );
  }

  const chip = bal > 0 ? { t: `${bal} short`, c: 'short' } : bal < 0 ? { t: `${-bal} spare`, c: 'spare' } : { t: 'even', c: 'even' };
  const fit = fitLines(r.cards <= 17 ? ['c', 't', 'dots'] : ['c', 't'], ['dots', 't'], space);
  return (
    <div className="pill" style={at(fit.h)} aria-live="polite">
      <span className={`c ${chip.c}`}>{chip.t}</span>
      {fit.has('t') && (
        <span className="t">
          {left} left · {needed} needed
        </span>
      )}
      {fit.has('dots') && <span className="dots">{dots}</span>}
    </div>
  );
}
