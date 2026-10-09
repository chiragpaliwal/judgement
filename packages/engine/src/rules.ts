import { rankOf, suitOf, type Card, type Suit } from './cards';
import type { Play, Round, Trick } from './types';

export const nextSeat = (seat: number, n: number) => (seat + 1) % n;

/** Seats in bidding order: left of dealer first, dealer last. */
export function biddingOrder(dealer: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => (dealer + 1 + i) % n);
}

/** Sum of bids placed so far (nulls ignored). */
export const bidTotal = (bids: readonly (number | null)[]) => bids.reduce<number>((a, b) => a + (b ?? 0), 0);

/**
 * The value the dealer may not bid (it would make total bids equal the card count),
 * or null if no value is hooked for this seat.
 */
export function hookedBid(round: Pick<Round, 'bids' | 'dealer' | 'cards'>, seat: number): number | null {
  if (seat !== round.dealer) return null;
  const others = round.bids.reduce<number>((a, b, i) => (i === seat ? a : a + (b ?? 0)), 0);
  const h = round.cards - others;
  return h >= 0 && h <= round.cards ? h : null;
}

export function legalBids(round: Pick<Round, 'bids' | 'dealer' | 'cards'>, seat: number): number[] {
  const hooked = hookedBid(round, seat);
  const out: number[] = [];
  for (let b = 0; b <= round.cards; b++) if (b !== hooked) out.push(b);
  return out;
}

/** The trick currently being played, or null between tricks. */
export function openTrick(round: Pick<Round, 'tricks'>): Trick | null {
  const t = round.tricks[round.tricks.length - 1];
  return t && t.winner === null ? t : null;
}

export const ledSuit = (plays: readonly Play[]): Suit | null => (plays.length ? suitOf(plays[0].card) : null);

export function legalCards(hand: readonly Card[], led: Suit | null): Card[] {
  if (!led) return [...hand];
  const follow = hand.filter((c) => suitOf(c) === led);
  return follow.length ? follow : [...hand];
}

export function isLegalPlay(hand: readonly Card[], led: Suit | null, card: Card): boolean {
  return legalCards(hand, led).includes(card);
}

/** Does card `a` beat card `b` given the led suit and trump? */
export function beats(a: Card, b: Card, led: Suit, trump: Suit): boolean {
  const sa = suitOf(a);
  const sb = suitOf(b);
  if (sa === sb) return rankOf(a) > rankOf(b);
  if (sa === trump) return true;
  if (sb === trump) return false;
  if (sa === led) return true;
  return false;
}

/** Index into `plays` of the card currently winning. */
export function winningIndex(plays: readonly Play[], trump: Suit): number {
  if (!plays.length) return -1;
  const led = suitOf(plays[0].card);
  let best = 0;
  for (let i = 1; i < plays.length; i++) {
    if (beats(plays[i].card, plays[best].card, led, trump)) best = i;
  }
  return best;
}

export function trickWinner(plays: readonly Play[], trump: Suit): number {
  return plays[winningIndex(plays, trump)].seat;
}

/** Would playing `card` now take the lead of the trick? */
export function wouldLead(card: Card, plays: readonly Play[], trump: Suit): boolean {
  if (!plays.length) return true;
  const best = plays[winningIndex(plays, trump)].card;
  return beats(card, best, suitOf(plays[0].card), trump);
}

export const scoreFor = (bid: number, won: number) => (bid === won ? 10 + bid : 0);

/** Lowest legal card: lowest rank, ties broken by suit order (non-trump preferred). */
export function lowestCard(cards: readonly Card[], trump: Suit): Card {
  return [...cards].sort((a, b) => {
    const ta = suitOf(a) === trump ? 1 : 0;
    const tb = suitOf(b) === trump ? 1 : 0;
    if (rankOf(a) !== rankOf(b)) return rankOf(a) - rankOf(b);
    return ta - tb;
  })[0];
}
