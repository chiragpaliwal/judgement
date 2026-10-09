// Determinized Monte Carlo search: sample hidden hands consistent with what the bot has seen,
// play each world out with the heuristic policy, and score the result.
import { fullDeck, suitOf, type Card, type Suit } from './cards';
import { voids } from './derive';
import { heuristicEstimate, heuristicPlay, nextHigher } from './botPolicy';
import { scoreFor, winningIndex } from './rules';
import { shuffle } from './rng';
import type { GameState, Play } from './types';

/** Weight on opponents' scores relative to the bot's own. Below 1 so the bot stays safe first. */
export const SPOILER_WEIGHT = 0.5;

export interface Sim {
  n: number;
  cards: number;
  trump: Suit;
  bids: number[];
  won: number[];
  hands: Card[][];
  plays: Play[];
  turn: number;
  tricksDone: number;
  /** Every card still in someone's hand. */
  live: Set<Card>;
}

export function cloneSim(s: Sim): Sim {
  return { ...s, bids: [...s.bids], won: [...s.won], hands: s.hands.map((h) => [...h]), plays: [...s.plays], live: new Set(s.live) };
}

export function step(s: Sim, card: Card): void {
  const hand = s.hands[s.turn];
  hand.splice(hand.indexOf(card), 1);
  s.live.delete(card);
  s.plays.push({ seat: s.turn, card });
  if (s.plays.length < s.n) {
    s.turn = (s.turn + 1) % s.n;
    return;
  }
  const w = s.plays[winningIndex(s.plays, s.trump)].seat;
  s.won[w]++;
  s.tricksDone++;
  s.plays = [];
  s.turn = w;
}

export function policyMove(s: Sim): Card {
  const hand = s.hands[s.turn];
  return heuristicPlay({
    hand,
    plays: s.plays,
    trump: s.trump,
    n: s.n,
    bid: s.bids[s.turn],
    won: s.won[s.turn],
    left: s.cards - s.tricksDone,
    higherOut: (c) => {
      for (let h = nextHigher(c); h; h = nextHigher(h)) if (s.live.has(h) && !hand.includes(h)) return true;
      return false;
    },
  });
}

export function rollout(s: Sim): void {
  while (s.tricksDone < s.cards) step(s, policyMove(s));
}

/** Opponent weights: everyone counts, players at or above the bot's total count more. Sums to 1. */
export function threatWeights(totals: readonly number[], seat: number): number[] {
  const mine = totals[seat];
  const raw = totals.map((t, j) => (j === seat ? 0 : 1 + (t >= mine ? 1 + (t - mine) / 25 : 0)));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((w) => w / sum);
}

/** Own score minus a weighted share of opponents' scores. */
export function utility(s: Sim, seat: number, weights: readonly number[]): number {
  let u = scoreFor(s.bids[seat], s.won[seat]);
  for (let j = 0; j < s.n; j++) if (j !== seat) u -= SPOILER_WEIGHT * weights[j] * scoreFor(s.bids[j], s.won[j]);
  return u;
}

export interface Belief {
  seat: number;
  trump: Suit;
  n: number;
  /** Unseen cards: not in the bot's hand and not played this round (includes undealt cards). */
  pool: Card[];
  /** Cards each seat still holds. */
  sizes: number[];
  /** Suits each seat has shown out of. */
  voids: Set<Suit>[];
  /** Cards each seat has played this round (for judging their bid). */
  played: Card[][];
  bids: (number | null)[];
}

/** What the bot knows about the round. Reads only its own hand and public information. */
export function beliefFor(state: GameState, seat: number): Belief {
  const r = state.round;
  const played: Card[][] = Array.from({ length: state.n }, () => []);
  for (const t of r.tricks) for (const p of t.plays) played[p.seat].push(p.card);
  const seen = new Set<Card>([...r.hands[seat], ...played.flat()]);
  return {
    seat,
    trump: r.trump,
    n: state.n,
    pool: fullDeck().filter((c) => !seen.has(c)),
    sizes: played.map((p) => r.cards - p.length),
    voids: voids(r.tricks, state.n).map((v) => new Set(v)),
    played,
    bids: r.bids,
  };
}

/** Deal the pool to the other seats respecting voids. Null if the random order dead-ends. */
function deal(b: Belief, rand: () => number, honourVoids: boolean): Card[][] | null {
  const pool = shuffle(b.pool, rand);
  const used = new Uint8Array(pool.length);
  const hands: Card[][] = Array.from({ length: b.n }, () => []);
  const seats = Array.from({ length: b.n }, (_, i) => i)
    .filter((i) => i !== b.seat)
    .sort((x, y) => b.voids[y].size - b.voids[x].size);
  for (const s of seats) {
    for (let i = 0; i < pool.length && hands[s].length < b.sizes[s]; i++) {
      if (used[i] || (honourVoids && b.voids[s].has(suitOf(pool[i])))) continue;
      used[i] = 1;
      hands[s].push(pool[i]);
    }
    if (hands[s].length < b.sizes[s]) return null;
  }
  return hands;
}

/** How believable each opponent's bid is given their (sampled) full hand. */
function plausibility(b: Belief, hands: Card[][]): number {
  let w = 1;
  for (let s = 0; s < b.n; s++) {
    const bid = b.bids[s];
    if (s === b.seat || bid === null) continue;
    const d = heuristicEstimate([...hands[s], ...b.played[s]], b.trump, b.n) - bid;
    w *= Math.exp(-(d * d) / (2 * 1.25 * 1.25));
  }
  return w;
}

/** Sample hidden hands: several void-respecting deals, one picked in proportion to how well it fits the bids. */
export function sampleWorld(b: Belief, rand: () => number, candidates = 4): Card[][] {
  const options: Card[][][] = [];
  const weights: number[] = [];
  for (let tries = 0; options.length < candidates && tries < candidates * 8; tries++) {
    const h = deal(b, rand, true);
    if (!h) continue;
    options.push(h);
    weights.push(plausibility(b, h));
  }
  if (!options.length) return deal(b, rand, false)!;
  const total = weights.reduce((a, c) => a + c, 0);
  if (total <= 0) return options[Math.floor(rand() * options.length)];
  let x = rand() * total;
  for (let i = 0; i < options.length; i++) if ((x -= weights[i]) <= 0) return options[i];
  return options[options.length - 1];
}
