// Display values from DESIGN_SPEC §6. Shared by the UI, bots and tests.
import { rankOf, suitOf, SUITS, type Card, type Suit } from './cards';
import { biddingOrder } from './rules';
import type { Trick } from './types';

export type PlayerStatus = 'bidding' | 'out' | 'dodge' | 'hold' | 'needs';
export type Stance = 'needs' | 'ducks' | 'nothingToLose';

/** Minimal round shape needed by the derivations (works for Round and RoundView). */
export interface RoundLike {
  cards: number;
  bids: (number | null)[];
  won: number[];
  tricks: Trick[];
  /** Completed tricks. If absent, counted from `tricks`. */
  tricksDone?: number;
}

export const tricksDone = (r: RoundLike) => r.tricksDone ?? r.tricks.filter((t) => t.winner !== null).length;
export const tricksLeft = (r: RoundLike) => r.cards - tricksDone(r);

export const need = (bid: number | null, won: number) => (bid === null ? 0 : Math.max(0, bid - won));

export function isOut(r: RoundLike, seat: number): boolean {
  const bid = r.bids[seat];
  if (bid === null) return false;
  const won = r.won[seat];
  return won > bid || bid - won > tricksLeft(r);
}

export function status(r: RoundLike, seat: number): PlayerStatus {
  const bid = r.bids[seat];
  if (bid === null) return 'bidding';
  if (isOut(r, seat)) return 'out';
  const won = r.won[seat];
  if (bid === 0 && won === 0) return 'dodge';
  if (won === bid) return 'hold';
  return 'needs';
}

/** Σ need over players still in, and tricks left. */
export function tableNeeds(r: RoundLike): { needed: number; left: number } {
  let needed = 0;
  r.bids.forEach((b, i) => {
    if (!isOut(r, i)) needed += need(b, r.won[i]);
  });
  return { needed, left: tricksLeft(r) };
}

/** > 0 short (more needed than exist), < 0 spare, 0 even. */
export function tableBalance(r: RoundLike): number {
  const { needed, left } = tableNeeds(r);
  return needed - left;
}

export function alive(r: RoundLike, seat: number): boolean {
  return tricksLeft(r) === 1 && need(r.bids[seat], r.won[seat]) === 1 && !isOut(r, seat);
}

export function stance(r: RoundLike, seat: number): Stance {
  if (isOut(r, seat)) return 'nothingToLose';
  return need(r.bids[seat], r.won[seat]) > 0 ? 'needs' : 'ducks';
}

/** Why a player is out, for tags and toasts. */
export function outReason(r: RoundLike, seat: number): { kind: 'over'; extra: number } | { kind: 'cantReach'; needed: number; left: number } | null {
  if (!isOut(r, seat)) return null;
  const bid = r.bids[seat] ?? 0;
  const won = r.won[seat];
  if (won > bid) return { kind: 'over', extra: won - bid };
  return { kind: 'cantReach', needed: bid - won, left: tricksLeft(r) };
}

/** Suits each seat has shown out of (failed to follow), from visible tricks. */
export function voids(tricks: readonly Trick[], n: number): Suit[][] {
  const out: Set<Suit>[] = Array.from({ length: n }, () => new Set<Suit>());
  for (const t of tricks) {
    if (!t.plays.length) continue;
    const led = suitOf(t.plays[0].card);
    for (const p of t.plays.slice(1)) if (suitOf(p.card) !== led) out[p.seat].add(led);
  }
  return out.map((s) => SUITS.filter((x) => s.has(x)));
}

export interface HandFacts {
  trump: Card[];
  voids: Suit[];
  high: Card[];
  /** Seats still to bid after `seat` (in order). Empty for the dealer. */
  biddersAfter: number[];
  /** Seat that leads trick 1. */
  leader: number;
}

/** Facts about a hand for the bidding sheet. No recommendations. */
export function facts(hand: readonly Card[], trump: Suit, seat: number, dealer: number, n: number): HandFacts {
  const order = biddingOrder(dealer, n);
  const pos = order.indexOf(seat);
  return {
    trump: hand.filter((c) => suitOf(c) === trump).sort((a, b) => rankOf(b) - rankOf(a)),
    voids: SUITS.filter((s) => !hand.some((c) => suitOf(c) === s)),
    high: hand.filter((c) => rankOf(c) >= 13).sort((a, b) => rankOf(b) - rankOf(a) || SUITS.indexOf(suitOf(a)) - SUITS.indexOf(suitOf(b))),
    biddersAfter: order.slice(pos + 1),
    leader: order[0],
  };
}
