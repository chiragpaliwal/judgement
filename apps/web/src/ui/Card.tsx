import { cardName, rankLabel, suitOf, type Card, type Suit } from '@judgement/engine';
import { SuitIcon } from './icons';

/**
 * Card face: rank top-left (mono), suit bottom-right, trump corner notch. Sized by its container.
 * `corner` adds a small suit under the rank, for cards whose bottom half is covered.
 */
export function CardFace({ card, trump, win, corner }: { card: Card; trump?: Suit | null; win?: boolean; corner?: boolean }) {
  const s = suitOf(card);
  return (
    <span className={`cf s-${s}${win ? ' win' : ''}`}>
      <span className="rk">
        {rankLabel(card)}
        {corner && <SuitIcon suit={s} className="ix" />}
      </span>
      <SuitIcon suit={s} className="pip-s" />
      {trump === s && <i className="tn" />}
    </span>
  );
}

export function cardAria(card: Card, trump?: Suit | null) {
  return `${cardName(card)}${trump && suitOf(card) === trump ? ', trump' : ''}`;
}

/** Tiny card used in lists (22×30). */
export function MiniCard({ card }: { card: Card }) {
  const s = suitOf(card);
  return (
    <span
      className={`mono s-${s}`}
      style={{ width: 22, height: 30, borderRadius: 4, background: 'var(--card)', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 500, flex: 'none' }}
      aria-label={cardName(card)}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {rankLabel(card)}
        <SuitIcon suit={s} style={{ width: 8, height: 8 }} />
      </span>
    </span>
  );
}
