import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  cardLabel,
  ledSuit,
  legalCards,
  openTrick,
  REACTIONS,
  tricksLeft,
  voids,
  type Card,
  type GameView,
  type Reaction,
  type RoomView,
} from '@judgement/engine';
import { Table } from '../game/Table';
import { Fan, Hero } from '../game/Hand';
import { BidSheet, FactChips } from '../game/BidSheet';
import { heroCaption, hintLine, lastTrickHeadline, stakeLine, turnHeader, waitLine } from '../game/narrate';
import { initialOf, seatNames } from '../game/seats';
import { Icon, SuitIcon } from '../ui/icons';
import { useRoom } from '../net/room';
import { haptic, sfx } from '../lib/fx';
import { CardsSeen } from './CardsSeen';
import { Scoreboard } from './Scoreboard';
import { MenuSheet } from './MenuSheet';
import { Paused } from './Paused';

export type Overlay = 'scores' | 'seen' | 'menu' | null;

export const REACTION_LABELS: Record<Reaction, string> = {
  '😂': 'Laugh',
  '😬': 'Yikes',
  '🔥': 'Fire',
  '👏': 'Clap',
  '😭': 'Cry',
  '🫡': 'Salute',
  '😴': 'Sleep',
};
const QUICK: Reaction[] = REACTIONS.filter((r) => r !== '😴');

export function TopBar({ game, onScores, onMenu }: { game: GameView; onScores: () => void; onMenu: () => void }) {
  const r = game.round;
  return (
    <header className="top">
      <div className="rd">
        Round {r.index + 1} <span>· {r.cards} {r.cards === 1 ? 'card' : 'cards'}</span>
      </div>
      <motion.div key={`${r.index}-${r.trump}`} className="trchip" aria-label={`Trump is ${r.trump === 's' ? 'spades' : r.trump === 'h' ? 'hearts' : r.trump === 'd' ? 'diamonds' : 'clubs'}`} initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.2 }}>
        <SuitIcon suit={r.trump} />
        <span>Trump</span>
      </motion.div>
      <div style={{ flex: 1 }} />
      <button className="ib" aria-label="Scoreboard" onClick={onScores}>
        <Icon.Scores />
      </button>
      <button className="ib" aria-label="Room menu" onClick={onMenu}>
        <Icon.More />
      </button>
    </header>
  );
}

export function ReactionDock({ disabled, pausedSet }: { disabled?: boolean; pausedSet?: boolean }) {
  const send = useRoom((s) => s.send);
  const set = pausedSet ? (['😂', '😬', '😴', '👏', '😭', '🫡'] as Reaction[]) : QUICK;
  return (
    <div className="dock rxs" aria-label="Quick reactions">
      {set.map((e) => (
        <button key={e} className="rx" aria-label={REACTION_LABELS[e]} disabled={disabled} onClick={() => { send({ type: 'react', emoji: e }); haptic('light'); }}>
          {e}
        </button>
      ))}
    </div>
  );
}

function ReactButton() {
  const [open, setOpen] = useState(false);
  const send = useRoom((s) => s.send);
  return (
    <>
      <button className={`ib sq${open ? ' on' : ''}`} aria-label="Send a reaction" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon.Smile />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="rxpop" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.15 }}>
            {QUICK.map((e) => (
              <button
                key={e}
                className="rx"
                aria-label={REACTION_LABELS[e]}
                onClick={() => {
                  send({ type: 'react', emoji: e });
                  haptic('light');
                  setOpen(false);
                }}
              >
                {e}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Keeps the area under the table from shrinking mid-round. The table takes whatever
 * height is left, so without this every turn change (header, hint, stake line,
 * a suit lane emptying) resized the table and every seat jumped.
 */
function useNoShrink(resetKey: string, enabled: boolean) {
  const ref = useRef<HTMLDivElement>(null);
  const [minH, setMinH] = useState(0);
  useLayoutEffect(() => setMinH(0), [resetKey, enabled]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;
    const ro = new ResizeObserver(() => setMinH((m) => Math.max(m, el.offsetHeight)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [enabled]);
  return [ref, enabled ? minH : 0] as const;
}

export function GameScreen({ room, game, compact }: { room: RoomView; game: GameView; compact: boolean }) {
  const send = useRoom((s) => s.send);
  const held = useRoom((s) => s.held);
  const toast = useRoom((s) => s.toast);
  const dealKey = useRoom((s) => s.dealKey);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [pendingBid, setPendingBid] = useState<number | null>(null);
  const [selected, setSelected] = useState<Card | null>(null);

  const r = game.round;
  const me = game.me;
  const names = seatNames(room, game);
  const paused = !!room.pause;
  const myTurn = me !== null && r.turn === me && !paused && !held;
  const bidding = game.phase === 'bidding';
  const playing = game.phase === 'playing' || ((game.phase === 'roundEnd' || game.phase === 'gameEnd') && !!held);
  const hand = r.hand;
  const plays = openTrick(r)?.plays ?? [];
  const legal = myTurn && game.phase === 'playing' ? legalCards(hand, ledSuit(plays)) : null;
  const [lowerRef, lowerMinH] = useNoShrink(String(r.index), !bidding);

  // Reset local selections when the turn/round moves on.
  useEffect(() => setPendingBid(null), [r.index, game.phase]);
  useEffect(() => {
    if (selected && !hand.includes(selected)) setSelected(null);
  }, [hand, selected]);
  useEffect(() => {
    if (!myTurn) setSelected(null);
  }, [myTurn]);
  useEffect(() => {
    if (!game.settings.tracker && overlay === 'seen') setOverlay(null);
  }, [game.settings.tracker, overlay]);

  const confirmBid = () => {
    if (pendingBid === null) return;
    send({ type: 'bid', bid: pendingBid });
    setPendingBid(null);
  };
  const playSelected = () => {
    if (!selected || !legal?.includes(selected)) return;
    send({ type: 'play', card: selected });
    setSelected(null);
    haptic('light');
  };
  const select = (c: Card) => {
    setSelected((s) => (s === c ? null : c));
    sfx.pop();
  };

  const handView = (opts: { interactive: boolean; size: 'lg' | 'sm' | 'xs'; dimmed?: boolean; height?: number; caption?: React.ReactNode }) => {
    if (!hand.length) return null;
    const common = {
      cards: hand,
      trump: r.trump,
      legal: opts.interactive ? legal : null,
      selected: opts.interactive ? selected : null,
      onSelect: select,
      dealKey,
    };
    if (hand.length === 1 && opts.caption) return <Hero {...common} card={hand[0]} caption={opts.caption} />;
    const size = compact && opts.size === 'lg' ? 'sm' : compact && opts.size === 'sm' ? 'xs' : opts.size;
    return <Fan {...common} size={size} dimmed={opts.dimmed} height={opts.height} />;
  };

  const heroCap = (() => {
    if (hand.length !== 1) return undefined;
    const c = heroCaption(game, hand[0], names);
    return (
      <>
        <div style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.25 }}>{c.title}</div>
        <div className="dim" style={{ fontSize: 14, lineHeight: 1.4 }}>
          {c.body}
        </div>
      </>
    );
  })();

  const seenBtn = game.settings.tracker ? (
    <button className="ib sq" aria-label="Cards seen this round" onClick={() => setOverlay('seen')}>
      <Icon.Grid />
    </button>
  ) : null;

  const toastEl = (
    <AnimatePresence>
      {toast && (
        <motion.div key={toast.id} className="toast" role="status" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <Icon.Ban />
          <div>
            <b>{toast.title}</b> <span className="dim">{toast.sub}</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  let lower: React.ReactNode;
  let dock: React.ReactNode;

  if (bidding && myTurn) {
    // 03 / 04 / 14: your bid.
    lower = (
      <>
        {hand.length === 1 ? (
          handView({ interactive: false, size: 'sm', caption: heroCap })
        ) : (
          <div style={{ padding: '6px 0 8px' }}>{handView({ interactive: false, size: hand.length > 12 ? 'xs' : hand.length > 6 ? 'sm' : 'lg' })}</div>
        )}
        <BidSheet game={game} names={names} pending={pendingBid} setPending={setPendingBid} onConfirm={confirmBid} />
      </>
    );
    dock = null;
  } else if (bidding) {
    // 02: others bidding.
    const who = names[r.turn];
    const status = paused ? 'Paused' : me !== null && r.bids[me] !== null ? `You bid ${r.bids[me]}. ${who === 'You' ? '' : `${who} is choosing…`}` : `${who} is choosing…`;
    lower = (
      <>
        {hand.length === 1 ? null : <FactChips game={game} names={names} wrapClass="pad12" />}
        <div style={{ paddingTop: 10 }}>{handView({ interactive: false, size: hand.length > 8 ? 'sm' : 'lg', caption: heroCap })}</div>
      </>
    );
    dock = (
      <div className="dock">
        <ReactButton />
        <div className="btn ghost cta" role="status" style={{ fontSize: 15 }}>
          {status}
        </div>
      </div>
    );
  } else if (playing && myTurn) {
    // 05: your turn.
    const head = turnHeader(game, legal?.length ?? 0);
    lower = (
      <>
        <div className="hh" style={{ marginTop: 6 }}>
          {head.lead ? (
            <>
              <b>You lead</b>
              <span className="dim">· any card</span>
            </>
          ) : (
            <>
              <b>Your turn</b>
              <span className="dim">Follow</span>
              <SuitIcon suit={head.suit!} dark />
              <span className="dim">· {head.playable} playable</span>
            </>
          )}
        </div>
        {toastEl}
        {handView({ interactive: true, size: hand.length > 8 ? 'sm' : 'lg', caption: heroCap })}
        <p className="hint" aria-live="polite">
          {selected ? hintLine(game, selected, names) : ''}
        </p>
      </>
    );
    dock = (
      <div className="dock">
        <ReactButton />
        {seenBtn}
        <button className={`btn cta ${selected ? 'amber' : 'ghost'}`} disabled={!selected} onClick={playSelected}>
          {selected ? `Play ${cardLabel(selected)}` : head.lead ? 'Pick a card to lead' : 'Pick a card'}
        </button>
      </div>
    );
  } else {
    // 06 / 08: waiting in play.
    const lastTrick = game.phase === 'playing' && tricksLeft(r) === 1;
    const v = voids(r.tricks, game.n);
    const actor = r.turn;
    const showStake = !held && !paused && game.phase === 'playing' && actor !== me;
    if (lastTrick && hand.length === 0 && !held) {
      const head = lastTrickHeadline(game, names);
      const remaining = room.members.map((_, i) => i).filter((i) => i !== me && !plays.some((p) => p.seat === i));
      const stanceOf = (i: number) => {
        const b = r.bids[i] ?? 0;
        const w = r.won[i];
        if (w > b || b - w > 1) return { t: 'nothing to lose', c: 'free' };
        if (b - w === 1) return { t: 'needs it', c: '' };
        return { t: 'ducks', c: 'duck' };
      };
      lower = (
        <>
          {toastEl}
          <section className="moment" aria-label="What the last trick means">
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
              {head.title}{' '}
              <span className="dim" style={{ fontWeight: 600 }}>
                {head.body}
              </span>
            </div>
            {remaining.length > 0 && (
              <div className="who" style={{ gridTemplateColumns: `repeat(${Math.min(4, remaining.length)}, minmax(0, 1fr))` }}>
                {remaining.slice(0, 4).map((i) => {
                  const s = stanceOf(i);
                  return (
                    <div className="w" key={i}>
                      <div className="a">{initialOf(names[i])}</div>
                      <span className="nm2">{names[i]}</span>
                      <span className={`st ${s.c}`}>{s.t}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </>
      );
    } else {
      const stake = showStake ? stakeLine(game, actor, names, v) : null;
      lower = (
        <>
          {toastEl}
          {stake && (
            <div className="stake" aria-live="polite">
              <div className="a">{initialOf(names[actor])}</div>
              <div>
                <b>{stake.title}</b> <span className="dim">{stake.body}</span>
              </div>
            </div>
          )}
          {hand.length > 0 && (
            <div className="dim" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, padding: '10px 20px 0' }}>
              <b style={{ color: 'var(--text)' }}>Your hand</b>
              {game.phase === 'playing' && !held && !paused && <span>· {waitLine(game, names)}</span>}
            </div>
          )}
          {handView({ interactive: false, size: 'sm', dimmed: true, height: compact ? 92 : 100, caption: heroCap })}
        </>
      );
    }
    dock = <ReactionDock />;
  }

  return (
    <main className={`scr${compact ? ' compact' : ''}`}>
      <TopBar game={game} onScores={() => setOverlay('scores')} onMenu={() => setOverlay('menu')} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: '1 1 auto', minHeight: 0 }}>
        <div style={{ display: 'flex', flex: '1 1 auto', minHeight: 0 }}>
          <Table room={room} game={game} pendingBid={bidding && myTurn ? pendingBid : null} compact={compact} small={bidding && myTurn && hand.length > 8} />
        </div>
        <div ref={lowerRef} style={{ display: 'flex', flexDirection: 'column', flex: 'none', minHeight: lowerMinH }}>
          {lower}
        </div>
      </div>
      {dock}

      <AnimatePresence>
        {overlay === 'scores' && <Scoreboard key="scores" room={room} game={game} onClose={() => setOverlay(null)} />}
        {overlay === 'seen' && <CardsSeen key="seen" room={room} game={game} onClose={() => setOverlay(null)} />}
        {overlay === 'menu' && <MenuSheet key="menu" room={room} game={game} onClose={() => setOverlay(null)} />}
      </AnimatePresence>
      <AnimatePresence>{paused && <Paused key="paused" room={room} game={game} />}</AnimatePresence>
    </main>
  );
}
