// Table and hand geometry from DESIGN_SPEC §4.2 and §4.6.

export interface Point {
  x: number;
  y: number;
}

export interface TableLayout {
  seats: Point[]; // avatar centres, by relative index (0 = local player, bottom)
  cards: (Point & { rot: number })[]; // trick card centres
  centre: Point;
  /** Where the centre pill sits (raised on short tables). */
  pill: Point;
  /** Table is short: the pill drops its secondary lines. */
  tight: boolean;
  rx: number;
  ry: number;
}

const CARD_ROT = [0, -6, 5, -3, 7, -5, 4];

export function tableLayout(n: number, W: number, H: number, compact: boolean): TableLayout {
  const cx = W / 2;
  const top = compact ? 20 : 22;
  const bottom = H - (compact ? 58 : 62);
  const cy = (top + bottom) / 2;
  const ry = (bottom - top) / 2;
  const rx = W / 2 - 33;
  const C = { x: cx, y: cy + 10 };
  // Short tables pull trick cards in so they never crowd the avatars.
  const k = H < 420 ? 0.45 : 0.55;
  const seats: Point[] = [];
  const cards: (Point & { rot: number })[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((90 + (i * 360) / n) * Math.PI) / 180;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    seats.push({ x: cx + rx * cos, y: cy + ry * sin });
    cards.push({ x: C.x + k * rx * cos, y: C.y + k * ry * sin, rot: CARD_ROT[i % CARD_ROT.length] });
  }
  const tight = H < 340;
  return { seats, cards, centre: C, pill: tight ? { x: cx, y: cy - 16 } : C, tight, rx, ry };
}

/** Relative index: 0 = local player at the bottom, then clockwise. */
export const relSeat = (seat: number, me: number | null, n: number) => (seat - (me ?? 0) + n) % n;

export interface FanCard {
  x: number;
  rot: number;
  drop: number;
}

export function fanLayout(count: number, available: number, w: number): FanCard[] {
  if (count === 0) return [];
  const spacing = count === 1 ? 0 : Math.min(0.72 * w, (available - 40 - w) / (count - 1));
  const total = w + spacing * (count - 1);
  const start = (available - total) / 2;
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: start + i * spacing,
    rot: (i - mid) * 3,
    drop: (i - mid) ** 2 * (count > 8 ? 1.2 : 1.6),
  }));
}
