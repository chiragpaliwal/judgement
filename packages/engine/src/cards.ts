// Cards are compact strings: rank char + suit char, e.g. "As", "Th", "9d".
export type Suit = 's' | 'h' | 'd' | 'c';
export type RankChar = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
export type Card = `${RankChar}${Suit}`;

export const SUITS: readonly Suit[] = ['s', 'h', 'd', 'c'];
export const RANKS: readonly RankChar[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export const SUIT_NAMES: Record<Suit, string> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
export const SUIT_SYMBOLS: Record<Suit, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const RANK_NAMES: Record<RankChar, string> = {
  '2': 'Two', '3': 'Three', '4': 'Four', '5': 'Five', '6': 'Six', '7': 'Seven', '8': 'Eight',
  '9': 'Nine', T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King', A: 'Ace',
};

export const suitOf = (c: Card): Suit => c[1] as Suit;
export const rankCharOf = (c: Card): RankChar => c[0] as RankChar;
/** 2..14 (Ace high). */
export const rankOf = (c: Card): number => RANKS.indexOf(rankCharOf(c)) + 2;
/** Display rank: "10" instead of "T". */
export const rankLabel = (c: Card): string => (c[0] === 'T' ? '10' : c[0]);
export const cardLabel = (c: Card): string => `${rankLabel(c)}${SUIT_SYMBOLS[suitOf(c)]}`;
export const cardName = (c: Card): string => `${RANK_NAMES[rankCharOf(c)]} of ${SUIT_NAMES[suitOf(c)]}`;

export function fullDeck(): Card[] {
  const deck: Card[] = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(`${r}${s}` as Card);
  return deck;
}

export function isCard(x: unknown): x is Card {
  return typeof x === 'string' && x.length === 2 && RANKS.includes(x[0] as RankChar) && SUITS.includes(x[1] as Suit);
}

/** Suit display order with trump first, then the remaining suits alternating colour where possible. */
export function suitOrder(trump: Suit | null): Suit[] {
  const base: Suit[] = ['s', 'h', 'c', 'd'];
  if (!trump) return base;
  const rest = base.filter((s) => s !== trump);
  return [trump, ...rest];
}

/** Hand sort: grouped by suit (trump first), high to low within a suit. */
export function sortHand(hand: readonly Card[], trump: Suit | null): Card[] {
  const order = suitOrder(trump);
  return [...hand].sort((a, b) => {
    const sa = order.indexOf(suitOf(a));
    const sb = order.indexOf(suitOf(b));
    if (sa !== sb) return sa - sb;
    return rankOf(b) - rankOf(a);
  });
}
