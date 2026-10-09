import { rankOf, suitOf, SUITS, type Card } from './cards';
import { need } from './derive';
import {
  beats,
  hookedBid,
  ledSuit,
  legalBids,
  legalCards,
  lowestCard,
  openTrick,
  winningIndex,
} from './rules';
import type { GameState } from './types';

/** Heuristic bid: side aces/kings, high trumps, plus ruffing potential. */
export function botBid(state: GameState, seat: number): number {
  const r = state.round;
  const hand = r.hands[seat];
  const trumps = hand.filter((c) => suitOf(c) === r.trump);
  let est = 0;
  for (const c of hand) {
    const s = suitOf(c);
    const rk = rankOf(c);
    if (s === r.trump) {
      if (rk >= 11) est += 1;
      else if (trumps.length >= 4) est += 0.5;
    } else if (rk === 14) est += 1;
    else if (rk === 13) est += hand.filter((x) => suitOf(x) === s).length >= 2 ? 0.75 : 0.4;
  }
  if (trumps.length >= 2) {
    for (const s of SUITS) {
      if (s === r.trump) continue;
      const len = hand.filter((c) => suitOf(c) === s).length;
      if (len <= 1) est += 0.5;
    }
  }
  // Big tables make every trick harder to take.
  est *= Math.max(0.6, 1 - (state.n - 4) * 0.06);
  let bid = Math.max(0, Math.min(r.cards, Math.round(est)));
  if (hookedBid(r, seat) === bid) {
    const options = legalBids(r, seat);
    bid = options.reduce((best, b) => (Math.abs(b - est) < Math.abs(best - est) ? b : best), options[0]);
  }
  return bid;
}

/** Heuristic play: take what you need as cheaply as possible, otherwise duck. */
export function botPlay(state: GameState, seat: number): Card {
  const r = state.round;
  const hand = r.hands[seat];
  const plays = openTrick(r)?.plays ?? [];
  const legal = legalCards(hand, ledSuit(plays));
  const bid = r.bids[seat] ?? 0;
  const won = r.won[seat];
  const doneTricks = r.tricks.filter((t) => t.winner !== null).length;
  const left = r.cards - doneTricks;
  const out = won > bid || bid - won > left;
  const wants = !out && need(bid, won) > 0;
  const byRankAsc = (a: Card, b: Card) => rankOf(a) - rankOf(b) || (suitOf(a) === r.trump ? 1 : 0) - (suitOf(b) === r.trump ? 1 : 0);

  if (out) return lowestCard(legal, r.trump);

  if (!plays.length) {
    // Leading.
    if (wants) {
      const sure = legal.filter((c) => rankOf(c) === 14 || (suitOf(c) === r.trump && rankOf(c) >= 12));
      if (sure.length) return sure.sort(byRankAsc)[sure.length - 1];
      return [...legal].sort(byRankAsc)[legal.length - 1];
    }
    return lowestCard(legal, r.trump);
  }

  const led = suitOf(plays[0].card);
  const best = plays[winningIndex(plays, r.trump)].card;
  const winners = legal.filter((c) => beats(c, best, led, r.trump)).sort(byRankAsc);
  const losers = legal.filter((c) => !beats(c, best, led, r.trump)).sort(byRankAsc);
  const lastToPlay = plays.length === state.n - 1;

  if (wants) {
    if (winners.length) {
      // Last to play: cheapest winner is guaranteed. Otherwise prefer a strong winner.
      return lastToPlay ? winners[0] : winners[winners.length - 1];
    }
    return losers.length ? losers[0] : lowestCard(legal, r.trump);
  }
  // Wants to lose: highest card that still loses, else the cheapest overall.
  if (losers.length) return losers[losers.length - 1];
  // Forced to win: shed the strongest card.
  return winners[winners.length - 1];
}
