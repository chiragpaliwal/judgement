// Table and hand geometry from DESIGN_SPEC §4.2 and §4.6.

export interface Point {
  x: number;
  y: number;
}

export interface TableLayout {
  seats: Point[]; // avatar centres, by relative index (0 = local player, bottom)
  cards: (Point & { rot: number })[]; // trick card centres
  centre: Point;
  /** Free vertical band around the centre for the pill, clear of seats (and trick cards while playing). */
  pill: { top: number; bottom: number };
  /** Short table with a seat straight across: that seat puts its name beside the avatar, not under it. */
  topSide: boolean;
  rx: number;
  ry: number;
}

const CARD_ROT = [0, -6, 5, -3, 7, -5, 4];
/** Half the width the pill needs; anything inside this band above or below it is in its way. */
const PILL_HALF = 54;
/** Height of the pill's usual stack while playing: chip, tricks line, dots. */
const PILL_FULL = 52;

interface Box {
  l: number;
  r: number;
  t: number;
  b: number;
}

export function tableLayout(n: number, W: number, H: number, compact: boolean, playing = false): TableLayout {
  const cx = W / 2;
  const top = compact ? 20 : 22;
  const bottom = H - (compact ? 58 : 62);
  const cy = (top + bottom) / 2;
  const ry = (bottom - top) / 2;
  const rx = W / 2 - 33;
  const C = { x: cx, y: cy + 10 };
  // Short tables pull trick cards in vertically so they never crowd the avatars; sideways there is room.
  const k = H < 420 ? 0.45 : 0.55;
  const topIdx = n % 2 === 0 ? n / 2 : -1;
  const topSide = topIdx > 0 && H < 360;

  // Seat footprints: avatar (+ badge) and the name/pips stack under it, or beside it for a side seat.
  const ar = compact ? 19 : 21;
  const seats: Point[] = [];
  const boxes: Box[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((90 + (i * 360) / n) * Math.PI) / 180;
    const p = { x: cx + rx * Math.cos(a), y: cy + ry * Math.sin(a) };
    seats.push(p);
    boxes.push(
      i === topIdx && topSide
        ? { l: p.x - ar - 10, r: p.x + ar + 110, t: p.y - ar - 6, b: p.y + ar + 6 }
        : { l: p.x - 40, r: p.x + 40, t: p.y - ar - 6, b: p.y + ar + (i === 0 ? 34 : 44) },
    );
  }

  const cw = compact ? 21 : 23;
  const ch = compact ? 29 : 32;
  const cards = seats.map((_, i) => {
    const a = ((90 + (i * 360) / n) * Math.PI) / 180;
    let y = C.y + k * ry * Math.sin(a);
    // The trick cards straight across and yours never sit on their seats.
    if (i === topIdx) y = Math.max(y, boxes[i].b + 2 + ch);
    if (i === 0) y = Math.min(y, boxes[0].t - 2 - ch);
    return { x: C.x + 0.55 * rx * Math.cos(a), y, rot: CARD_ROT[i % CARD_ROT.length] };
  });
  // Too little room between those two for the pill's full stack: slide them out towards their seats.
  if (topIdx > 0) {
    const deficit = PILL_FULL - (cards[0].y - cards[topIdx].y - 2 * (ch + 4) - 6);
    if (deficit > 0) {
      cards[topIdx].y = Math.max(boxes[topIdx].b + 2 + ch, cards[topIdx].y - deficit / 2);
      cards[0].y = Math.min(boxes[0].t - 2 - ch, cards[0].y + deficit / 2);
    }
  }
  // Only the cards straight above and below the pill push it; the diagonals sit beside it.
  if (playing) for (const c of cards) if (Math.abs(c.x - cx) < 30) boxes.push({ l: c.x - cw, r: c.x + cw, t: c.y - ch - 4, b: c.y + ch + 4 });

  return { seats, cards, centre: C, pill: freeBand(boxes, cx, C.y, H), topSide, rx, ry };
}

/** The vertical gap around y, between whatever crosses the pill's column. */
function freeBand(boxes: Box[], cx: number, y: number, H: number) {
  let t = 0;
  let b = H;
  for (const o of boxes) {
    if (o.r <= cx - PILL_HALF || o.l >= cx + PILL_HALF) continue;
    const mid = (o.t + o.b) / 2;
    if (mid <= y) t = Math.max(t, o.b);
    else b = Math.min(b, o.t);
  }
  return { top: t + 3, bottom: Math.max(t + 3, b - 3) };
}

/** Centre of a pill of height h in band, as close to y as it fits. */
export function placePill(band: { top: number; bottom: number }, y: number, h: number) {
  if (band.bottom - band.top <= h) return (band.top + band.bottom) / 2;
  return Math.min(Math.max(y, band.top + h / 2), band.bottom - h / 2);
}

/** Relative index: 0 = local player at the bottom, then clockwise. */
export const relSeat = (seat: number, me: number | null, n: number) => (seat - (me ?? 0) + n) % n;

export interface FanCard {
  x: number;
  rot: number;
  drop: number;
  /** Back row of a two-row hand. */
  back?: boolean;
}

/** A one-row fan showing less than this much of each card splits into two rows. */
const MIN_FAN_STEP = 26;

const fanStep = (count: number, available: number, w: number, margin = 40) =>
  count <= 1 ? 0 : Math.min(0.72 * w, (available - margin - w) / (count - 1));

export const needsTiers = (count: number, available: number, w: number) => count > 1 && fanStep(count, available, w) < MIN_FAN_STEP;

/**
 * Big hands: two overlapping rows, the first half of the (suit-sorted) hand behind and raised
 * by half a card so its ranks show. Both rows share one spacing, so the shorter front row
 * sits staggered between the back row's cards.
 */
export function tierLayout(count: number, available: number, w: number, h: number): FanCard[] {
  const nb = Math.ceil(count / 2);
  const spacing = fanStep(nb, available, w, 24);
  const row = (k: number, back: boolean) => {
    const start = (available - (w + spacing * (k - 1))) / 2;
    const mid = (k - 1) / 2;
    return Array.from({ length: k }, (_, i) => ({
      x: start + i * spacing,
      rot: (i - mid) * 1.5,
      drop: (i - mid) ** 2 * 0.8 - (back ? h / 2 : 0),
      back,
    }));
  };
  return [...row(nb, true), ...row(count - nb, false)];
}

export function fanLayout(count: number, available: number, w: number): FanCard[] {
  if (count === 0) return [];
  const spacing = fanStep(count, available, w);
  const total = w + spacing * (count - 1);
  const start = (available - total) / 2;
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({
    x: start + i * spacing,
    rot: (i - mid) * 3,
    drop: (i - mid) ** 2 * (count > 8 ? 1.2 : 1.6),
  }));
}
