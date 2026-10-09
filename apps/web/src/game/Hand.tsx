import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { suitOf, suitOrder, type Card, type Suit } from '@judgement/engine';
import { CardFace, cardAria } from '../ui/Card';
import { SuitIcon } from '../ui/icons';
import { usePrefs } from '../lib/prefs';
import { fanLayout } from './geometry';

const OUT = [0.2, 0.8, 0.2, 1] as const;

export interface HandProps {
  cards: Card[];
  trump: Suit;
  /** Cards that may be played now; null = hand is not interactive. */
  legal: Card[] | null;
  selected: Card | null;
  onSelect?: (c: Card) => void;
  size: 'lg' | 'sm' | 'xs';
  dimmed?: boolean;
  dealKey: number;
  height?: number;
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const dealStagger = (n: number) => Math.min(0.04, 0.56 / Math.max(1, n));

export function Fan({ cards, trump, legal, selected, onSelect, size, dimmed, dealKey, height }: HandProps) {
  const [ref, width] = useWidth<HTMLElement>();
  const reduced = usePrefs((s) => s.reducedMotion);
  const dealing = useDealing(dealKey, cards.length);
  const w = size === 'lg' ? 70 : size === 'sm' ? 60 : 50;
  const layout = fanLayout(cards.length, width, w);
  const h = height ?? (size === 'lg' ? 140 : size === 'sm' ? 112 : 104);
  const stagger = dealStagger(cards.length);

  return (
    <section ref={ref} className={`fan${size === 'sm' ? ' sm' : size === 'xs' ? ' xs' : ''}`} style={{ height: h }} aria-label="Your hand">
      {width > 0 &&
        cards.map((c, i) => {
          const f = layout[i];
          const interactive = legal !== null;
          const ok = !interactive || legal.includes(c);
          const sel = selected === c;
          const lift = sel ? 16 : interactive && ok ? 6 : 0;
          const transition = reduced
            ? { duration: 0.12 }
            : dealing
              ? { duration: 0.22, ease: OUT, delay: i * stagger, rotateY: { delay: 0.22 + i * stagger, duration: 0.16 } }
              : { duration: 0.12, ease: OUT };
          return (
            <motion.button
              key={`${dealKey}-${c}`}
              className={`hc${interactive && !ok ? ' off' : ''}${sel ? ' sel' : ''}${dimmed ? ' dimmed' : ''}`}
              style={{ left: f.x, zIndex: i }}
              initial={reduced ? { opacity: 0, y: f.drop, rotate: f.rot } : { y: -320, opacity: 0, rotate: f.rot - 20, rotateY: 90 }}
              animate={{ y: f.drop - lift, opacity: 1, rotate: f.rot, rotateY: 0 }}
              transition={transition}
              disabled={!interactive || !ok}
              onClick={() => onSelect?.(c)}
              aria-label={cardAria(c, trump)}
              aria-pressed={interactive ? sel : undefined}
            >
              <CardFace card={c} trump={trump} />
            </motion.button>
          );
        })}
    </section>
  );
}

/** True for the ~1s after a new deal, so the deal stagger doesn't slow later lifts. */
function useDealing(dealKey: number, n: number) {
  const [dealing, setDealing] = useState(true);
  useLayoutEffect(() => {
    setDealing(true);
    const t = setTimeout(() => setDealing(false), 400 + n * dealStagger(n) * 1000 + 200);
    return () => clearTimeout(t);
    // Only a new deal restarts the stagger; playing a card must not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealKey]);
  return dealing;
}

/** Hands of more than 12 cards: four suit rows, trump first (DESIGN_SPEC §4.7). */
export function Lanes({ cards, trump, legal, selected, onSelect, dealKey, size }: HandProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const order = suitOrder(trump).filter((s) => cards.some((c) => suitOf(c) === s));
  const gap = 5;
  // 'xs' = glance mode while bidding: small cards so the bid pad fits.
  const cw = width > 0 ? (size === 'xs' ? Math.min(28, (width - 16 - gap * 12) / 13) : (width - 16 - gap * 6) / 6) : 0;
  return (
    <div ref={ref} className={`lanes${size === 'xs' ? ' tiny' : ''}`} aria-label="Your hand">
      {width > 0 &&
        order.map((s) => {
          const row = cards.filter((c) => suitOf(c) === s);
          const rowW = width - 16 - gap;
          const step = row.length > 1 ? Math.min(cw + (size === 'xs' ? 3 : gap), (rowW - cw) / (row.length - 1)) : 0;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', gap: size === 'xs' ? 3 : gap }}>
              <span className="ls" style={{ width: 16, flex: 'none' }}>
                <SuitIcon suit={s} dark style={{ width: 14, height: 14, display: 'block' }} />
              </span>
              <div style={{ position: 'relative', flex: 1, height: cw * 1.4 }}>
                {row.map((c, i) => {
                  const interactive = legal !== null;
                  const ok = !interactive || legal.includes(c);
                  return (
                    <motion.button
                      key={`${dealKey}-${c}`}
                      className={`lcard${size === 'xs' ? ' tiny' : ''}${interactive && !ok ? ' off' : ''}${selected === c ? ' sel' : ''}`}
                      style={{ position: 'absolute', left: i * step, width: cw, zIndex: i }}
                      initial={{ opacity: 0, y: -20 }}
                      animate={{ opacity: 1, y: selected === c ? -4 : 0 }}
                      transition={{ duration: 0.2, delay: selected ? 0 : i * 0.02 }}
                      disabled={!interactive || !ok}
                      onClick={() => onSelect?.(c)}
                      aria-label={cardAria(c, trump)}
                      aria-pressed={interactive ? selected === c : undefined}
                    >
                      <CardFace card={c} trump={trump} />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** 1-card round: one big card with a plain caption. */
export function Hero({ card, trump, legal, selected, onSelect, dealKey, caption }: Omit<HandProps, 'cards' | 'size'> & { card: Card; caption: ReactNode }) {
  const interactive = legal !== null;
  const ok = !interactive || legal.includes(card);
  return (
    <div className="stage">
      <motion.button
        key={`${dealKey}-${card}`}
        className={`hero${selected === card ? ' sel' : ''}${interactive && !ok ? ' off' : ''}`}
        initial={{ y: -200, opacity: 0, rotateY: 90 }}
        animate={{ y: selected === card ? -10 : 0, opacity: 1, rotateY: 0, rotate: -3 }}
        transition={{ duration: 0.3, ease: OUT, rotateY: { delay: 0.22, duration: 0.16 } }}
        disabled={!interactive || !ok}
        onClick={() => onSelect?.(card)}
        aria-label={cardAria(card, trump)}
      >
        <CardFace card={card} trump={trump} />
      </motion.button>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 220 }}>{caption}</div>
    </div>
  );
}
