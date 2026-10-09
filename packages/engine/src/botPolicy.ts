// Fast heuristics: the rollout policy for bot search and the model of how opponents bid.
import { RANKS, rankOf, suitOf, SUITS, type Card, type Suit } from './cards';
import { beats, ledSuit, legalCards, lowestCard, winningIndex } from './rules';
import type { Play } from './types';

/** Expected tricks for a hand: side aces/kings, high trumps, trump length and ruffing potential. */
export function heuristicEstimate(hand: readonly Card[], trump: Suit, n: number): number {
  const len = (s: Suit) => hand.filter((c) => suitOf(c) === s).length;
  const trumps = len(trump);
  let est = 0;
  for (const c of hand) {
    const s = suitOf(c);
    const rk = rankOf(c);
    if (s === trump) {
      if (rk >= 13) est += 1;
      else if (rk === 12) est += trumps >= 2 ? 0.85 : 0.4;
      else if (rk === 11) est += trumps >= 3 ? 0.65 : 0.25;
    } else if (rk === 14) est += 1;
    else if (rk === 13) est += len(s) >= 2 ? 0.7 : 0.35;
    else if (rk === 12) est += len(s) >= 3 ? 0.3 : 0.1;
  }
  // Long trumps take tricks once the high ones are gone.
  if (trumps > 3) est += (trumps - 3) * 0.5;
  if (trumps >= 2) {
    for (const s of SUITS) {
      if (s === trump) continue;
      const l = len(s);
      if (l === 0) est += 0.6;
      else if (l === 1) est += 0.35;
    }
  }
  // Big tables make every trick harder to take.
  return est * Math.max(0.6, 1 - (n - 4) * 0.06);
}

/** Round the estimate to a bid, stepping off the hooked value if needed. */
export function heuristicBid(hand: readonly Card[], trump: Suit, cards: number, n: number, hooked: number | null): number {
  const est = heuristicEstimate(hand, trump, n);
  const bid = Math.max(0, Math.min(cards, Math.round(est)));
  if (bid !== hooked) return bid;
  const up = bid + 1 <= cards ? bid + 1 : null;
  const down = bid - 1 >= 0 ? bid - 1 : null;
  if (up === null) return down!;
  if (down === null) return up;
  return Math.abs(up - est) < Math.abs(down - est) ? up : down;
}

export interface PlayContext {
  hand: readonly Card[];
  plays: readonly Play[];
  trump: Suit;
  n: number;
  bid: number;
  won: number;
  /** Tricks left in the round, including the current one. */
  left: number;
  /** Is a higher card of this suit still held by someone else? */
  higherOut: (card: Card) => boolean;
}

const byRankAsc = (trump: Suit) => (a: Card, b: Card) =>
  rankOf(a) - rankOf(b) || (suitOf(a) === trump ? 1 : 0) - (suitOf(b) === trump ? 1 : 0);

/** Take what you need as cheaply as possible, otherwise duck and shed danger. */
export function heuristicPlay(ctx: PlayContext): Card {
  const { hand, plays, trump, n, bid, won, left, higherOut } = ctx;
  const legal = legalCards(hand, ledSuit(plays));
  if (legal.length === 1) return legal[0];
  const out = won > bid || bid - won > left;
  if (out) return lowestCard(legal, trump);
  const wants = bid > won;
  const asc = byRankAsc(trump);

  if (!plays.length) {
    if (wants) {
      const boss = legal.filter((c) => !higherOut(c));
      // Draw with boss trumps first, then cash side-suit winners.
      const bossTrump = boss.filter((c) => suitOf(c) === trump);
      if (bossTrump.length) return bossTrump.sort(asc)[0];
      if (boss.length) return boss.sort(asc)[boss.length - 1];
      return [...legal].sort(asc)[legal.length - 1];
    }
    // Ducking: lead low from the longest side suit.
    const side = legal.filter((c) => suitOf(c) !== trump);
    const pool = side.length ? side : legal;
    let bestSuit: Suit = suitOf(pool[0]);
    let bestLen = -1;
    for (const s of SUITS) {
      const l = pool.filter((c) => suitOf(c) === s).length;
      if (l > bestLen) [bestSuit, bestLen] = [s, l];
    }
    return lowestCard(pool.filter((c) => suitOf(c) === bestSuit), trump);
  }

  const led = suitOf(plays[0].card);
  const best = plays[winningIndex(plays, trump)].card;
  const winners = legal.filter((c) => beats(c, best, led, trump)).sort(asc);
  const losers = legal.filter((c) => !beats(c, best, led, trump)).sort(asc);
  const lastToPlay = plays.length === n - 1;

  if (wants) {
    if (winners.length) {
      if (lastToPlay) return winners[0];
      const safe = winners.filter((c) => !higherOut(c));
      return safe.length ? safe[0] : winners[winners.length - 1];
    }
    return losers[0];
  }
  if (losers.length) {
    // Void: discard the most dangerous side card. Following: highest card that still loses.
    const off = losers.filter((c) => suitOf(c) !== led && suitOf(c) !== trump);
    return off.length ? off[off.length - 1] : losers[losers.length - 1];
  }
  return winners[winners.length - 1];
}

/** Card one rank above, or null for an Ace. */
export const nextHigher = (c: Card): Card | null => {
  const i = RANKS.indexOf(c[0] as (typeof RANKS)[number]);
  return i < RANKS.length - 1 ? (`${RANKS[i + 1]}${c[1]}` as Card) : null;
};
