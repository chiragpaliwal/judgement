import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { motion } from 'motion/react';
import type { Card, Suit } from '@judgement/engine';
import { CardFace, cardAria } from '../ui/Card';
import { usePrefs } from '../lib/prefs';
import { fanLayout, needsTiers, tierLayout } from './geometry';

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
  const ch = size === 'lg' ? 98 : size === 'sm' ? 84 : 70;
  // Too many cards for one readable fan (13-card rounds): two rows, every card still in view.
  const tiers = needsTiers(cards.length, width, w);
  const layout = tiers ? tierLayout(cards.length, width, w, ch) : fanLayout(cards.length, width, w);
  // The arc's outer cards sag and tilt below the baseline; lift the fan so they stay inside it.
  const sink = Math.ceil(Math.max(0, ...layout.map((f) => f.drop + (w / 2) * Math.sin((Math.abs(f.rot) * Math.PI) / 180))));
  const h = (height ?? (size === 'lg' ? 140 : size === 'sm' ? 112 : 104)) + (tiers ? Math.round(ch / 2) : 0) + sink;
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
              style={{ left: f.x, bottom: 4 + sink, zIndex: i }}
              initial={reduced ? { opacity: 0, y: f.drop, rotate: f.rot } : { y: -320, opacity: 0, rotate: f.rot - 20, rotateY: 90 }}
              animate={{ y: f.drop - lift, opacity: 1, rotate: f.rot, rotateY: 0 }}
              transition={transition}
              disabled={!interactive || !ok}
              onClick={() => onSelect?.(c)}
              aria-label={cardAria(c, trump)}
              aria-pressed={interactive ? sel : undefined}
            >
              <CardFace card={c} trump={trump} corner />
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
