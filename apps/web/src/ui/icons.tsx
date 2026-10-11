import type { CSSProperties } from 'react';
import { SUIT_NAMES, type Suit } from '@judgement/engine';

const SUIT_PATHS: Record<Suit, string> = {
  s: 'M12 2C9 6.5 3 9.5 3 14c0 2.8 2.2 4.6 4.6 4.6 1.6 0 2.9-.7 3.6-1.8L10 22h4l-1.2-5.2c.7 1.1 2 1.8 3.6 1.8 2.4 0 4.6-1.8 4.6-4.6C21 9.5 15 6.5 12 2z',
  h: 'M12 21.5C8 18.6 2.5 14.6 2.5 9.4 2.5 6.4 4.8 4 7.6 4c1.9 0 3.4 1 4.4 2.6C13 5 14.5 4 16.4 4c2.8 0 5.1 2.4 5.1 5.4 0 5.2-5.5 9.2-9.5 12.1z',
  d: 'M12 1.5 19.5 12 12 22.5 4.5 12z',
  c: 'M12 2.5a4.3 4.3 0 0 0-4.1 5.6 4.3 4.3 0 1 0 2.6 7.9L9.6 22h4.8l-.9-6a4.3 4.3 0 1 0 2.6-7.9A4.3 4.3 0 0 0 12 2.5z',
};

/** Suit glyph as SVG (never emoji). `dark` = colour for dark surfaces. */
export function SuitIcon({ suit, dark, className, style, title }: { suit: Suit; dark?: boolean; className?: string; style?: CSSProperties; title?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={[dark ? `sd-${suit}` : `s-${suit}`, className].filter(Boolean).join(' ')}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={SUIT_PATHS[suit]} fill="currentColor" />
    </svg>
  );
}

export const suitWord = (s: Suit, plural = true) => (plural ? SUIT_NAMES[s] : SUIT_NAMES[s].replace(/s$/, ''));

type IconProps = { size?: number; className?: string };
const stroke = (w = 1.8) => ({ fill: 'none', stroke: 'currentColor', strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

export const Icon = {
  Scores: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke()} aria-hidden>
      <path d="M5 20V11M12 20V4M19 20v-6" />
    </svg>
  ),
  More: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="currentColor" aria-hidden>
      <circle cx="5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="19" cy="12" r="1.7" />
    </svg>
  ),
  Check: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2.6)} aria-hidden>
      <path d="M5 12.5l4.5 4.5L19 7" />
    </svg>
  ),
  X: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2.4)} aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  ),
  Smile: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke()} aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5c1 1.2 2.1 1.8 3.5 1.8s2.5-.6 3.5-1.8M9 9.5h.01M15 9.5h.01" />
    </svg>
  ),
  Chat: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke()} aria-hidden>
      <path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8l-4.5 3.5V17H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z" />
    </svg>
  ),
  Send: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2.2)} aria-hidden>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  ),
  Pencil: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke()} aria-hidden>
      <path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4" />
    </svg>
  ),
  Grid: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </svg>
  ),
  Hook: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2.2)} aria-hidden>
      <path d="M15 3v10.5a5 5 0 0 1-10 0V10l3 3" />
    </svg>
  ),
  Share: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2)} aria-hidden>
      <path d="M12 15V3M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  ),
  Copy: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
    </svg>
  ),
  Ban: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2)} stroke="#FF8A7A" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M5.6 5.6l12.8 12.8" />
    </svg>
  ),
  Offline: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2.4)} aria-hidden>
      <path d="M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.3-1.7M2 9.5a15 15 0 0 1 4.5-2.8M12 20h.01" />
    </svg>
  ),
  Undo: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2)} aria-hidden>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5" />
    </svg>
  ),
  Plus: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2)} aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Bot: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(1.8)} aria-hidden>
      <rect x="5" y="8" width="14" height="11" rx="3" />
      <path d="M12 4v4M9.5 13h.01M14.5 13h.01" />
    </svg>
  ),
  Back: ({ size, className }: IconProps) => (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} {...stroke(2)} aria-hidden>
      <path d="M15 5l-7 7 7 7" />
    </svg>
  ),
};
