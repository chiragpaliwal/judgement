import type { Suit } from './cards';

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 7;

/** Trump rotation: Hearts, Spades, Diamonds, Clubs, then repeat. */
export const TRUMP_ORDER: readonly Suit[] = ['h', 's', 'd', 'c'];

export const trumpFor = (roundIndex: number): Suit => TRUMP_ORDER[roundIndex % TRUMP_ORDER.length];

/** Most cards each player can be dealt with n players. */
export const maxCardsFor = (players: number): number => Math.floor(52 / players);

/** Default: deal as many whole cards as the deck allows (capped per player count at deal time). */
export const DEFAULT_START_CARDS = maxCardsFor(MIN_PLAYERS);

/** Cards actually used for the first round. */
export const effectiveStart = (startCards: number, players: number): number =>
  Math.max(1, Math.min(startCards, maxCardsFor(players)));

/** Cards per round, counting down to 1. */
export function roundPlan(startCards: number, players: number): number[] {
  const start = effectiveStart(startCards, players);
  return Array.from({ length: start }, (_, i) => start - i);
}
