import { motion } from 'motion/react';
import { bidTotal, facts, hookedBid, rankLabel, suitOf, type Card, type GameView, type Suit } from '@judgement/engine';
import { Icon, SuitIcon } from '../ui/icons';
import { hookText, joinNames } from './narrate';

const cardText = (c: Card) => (
  <span key={c} style={{ display: 'inline-flex', alignItems: 'center' }}>
    {rankLabel(c)}
    <SuitIcon suit={suitOf(c)} dark style={{ width: 10, height: 10 }} />
  </span>
);

/** Facts about the hand. Never a recommendation (DESIGN_SPEC §2.3, §4.8). */
export function FactChips({ game, names, wrapClass }: { game: GameView; names: string[]; wrapClass?: string }) {
  const r = game.round;
  const me = game.me;
  if (me === null) return null;
  const f = facts(r.hand, r.trump, me, r.dealer, game.n);
  const allAces = f.high.length > 0 && f.high.every((c) => c[0] === 'A');
  const after = f.biddersAfter.filter((s) => r.bids[s] === null);
  return (
    <div className={`facts ${wrapClass ?? ''}`}>
      <span className="fact">
        <SuitIcon suit={r.trump} dark />
        <b>{f.trump.length} trump</b>
        {f.trump.length > 0 && <span className="mono" style={{ display: 'inline-flex', gap: 4 }}>{f.trump.slice(0, 5).map((c) => rankLabel(c))}</span>}
      </span>
      {f.high.length > 0 && (
        <span className="fact">
          <b>
            {f.high.length} {allAces ? (f.high.length === 1 ? 'ace' : 'aces') : 'high'}
          </b>
          <span style={{ display: 'inline-flex', gap: 4 }}>{f.high.slice(0, 4).map(cardText)}</span>
        </span>
      )}
      {f.voids.length > 0 && f.voids.length < 4 && (
        <span className="fact">
          <b>Void</b>
          {f.voids.map((s: Suit) => (
            <SuitIcon key={s} suit={s} dark />
          ))}
        </span>
      )}
      <span className="fact">
        <b>{names[f.leader]}</b> {names[f.leader] === 'You' ? 'lead' : 'leads'}
      </span>
      {me !== r.dealer && after.length > 0 && (
        <span className="fact">
          <b>{joinNames(after.map((s) => names[s]))}</b> bid after you
        </span>
      )}
    </div>
  );
}

export function BidSheet({
  game,
  names,
  pending,
  setPending,
  onConfirm,
}: {
  game: GameView;
  names: string[];
  pending: number | null;
  setPending: (n: number | null) => void;
  onConfirm: () => void;
}) {
  const r = game.round;
  const me = game.me!;
  const hooked = hookedBid(r, me);
  const total = bidTotal(r.bids);
  const isDealer = me === r.dealer;

  const effect = (b: number) => {
    const d = total + b - r.cards;
    if (d === 0) return { text: 'even', cls: 'ev' };
    return d < 0 ? { text: `${-d} spare`, cls: 'sp' } : { text: `${d} short`, cls: 'sh' };
  };

  const header =
    hooked !== null ? (
      <div className="hook">
        <motion.div className="ic" initial={{ y: -8, scale: 0.8 }} animate={{ y: 0, scale: 1 }} transition={{ type: 'spring', bounce: 0.45, duration: 0.3 }}>
          <Icon.Hook />
        </motion.div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>You’re on the hook</div>
          <div className="dim" style={{ fontSize: 13, lineHeight: 1.35 }}>
            {hookText(hooked)}
          </div>
        </div>
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, padding: '0 4px' }}>
        <h2 style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.02em' }}>Your bid</h2>
        <span className="dim" style={{ fontSize: 14 }}>
          How many tricks will you take?
        </span>
      </div>
    );

  const cta = (
    <button className={`btn ${pending !== null ? 'amber' : 'ghost'}`} disabled={pending === null} onClick={onConfirm}>
      {pending !== null ? `Bid ${pending}` : 'Choose a bid'}
    </button>
  );

  if (r.cards === 1) {
    const opts = [
      { v: 0, label: 'Let it go' },
      { v: 1, label: 'Take it' },
    ];
    return (
      <section className="sheet" aria-label="Choose your bid">
        {hooked !== null && header}
        <div className="two" role="radiogroup" aria-label="Bid">
          {opts.map((o) => {
            const locked = hooked === o.v;
            const after = total + o.v;
            const note = after < 1 ? `table stays ${after} of 1` : after === 1 ? 'table makes it exactly 1' : `table goes ${after - 1} over`;
            return (
              <button
                key={o.v}
                className={`ch${pending === o.v ? ' on' : ''}${locked ? ' lock' : ''}`}
                role="radio"
                aria-checked={pending === o.v}
                aria-disabled={locked}
                onClick={() => !locked && setPending(o.v)}
              >
                <span className="v">{o.v}</span>
                <span className="l">{o.label}</span>
                <span className={`r${after > 1 ? ' sh' : ''}`}>{locked ? 'on the hook' : note}</span>
              </button>
            );
          })}
        </div>
        {cta}
      </section>
    );
  }

  return (
    <section className="sheet" aria-label="Choose your bid" style={{ gap: hooked !== null ? 12 : 10 }}>
      {header}
      <FactChips game={game} names={names} />
      <div className={`pad${r.cards >= 10 ? ' six' : ''}`} role="radiogroup" aria-label="Bid">
        {Array.from({ length: r.cards + 1 }, (_, b) => {
          const locked = hooked === b;
          const on = pending === b;
          const ef = effect(b);
          return (
            <button
              key={b}
              className={`bb${isDealer && r.cards < 10 ? ' tall' : ''}${on ? ' on' : ''}${locked ? ' lock' : ''}`}
              role="radio"
              aria-checked={on}
              aria-disabled={locked}
              aria-label={locked ? `Bid ${b} not allowed, you are on the hook` : `Bid ${b}, table ${ef.text}`}
              onClick={() => !locked && setPending(on ? null : b)}
            >
              <span className="v">{b}</span>
              {locked ? (
                <motion.span className="r" initial={{ y: -10, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', bounce: 0.5, duration: 0.3, delay: 0.2 }}>
                  <Icon.Hook />
                </motion.span>
              ) : isDealer ? (
                <span className={`r ${ef.cls}`}>{ef.text}</span>
              ) : (
                <span className="r">
                  {total + b}/{r.cards}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {cta}
    </section>
  );
}
