import { rankOf, suitOf, type Card } from './cards';
import { heuristicBid, heuristicEstimate } from './botPolicy';
import { beliefFor, cloneSim, policyMove, rollout, sampleWorld, step, threatWeights, utility, type Sim } from './botSearch';
import { biddingOrder, hookedBid, ledSuit, legalBids, legalCards, openTrick } from './rules';
import { mulberry32 } from './rng';
import type { GameState } from './types';

export interface BotOptions {
  /** Sampled worlds per decision. Default scales with the work left in the round. */
  samples?: number;
}

/** Simulated card plays per decision, across all candidates and samples. */
const BUDGET = 60_000;
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function rngFor(state: GameState, seat: number) {
  const r = state.round;
  const plays = r.tricks.reduce((a, t) => a + t.plays.length, 0);
  const bids = r.bids.filter((b) => b !== null).length;
  return mulberry32(state.seed ^ Math.imul(r.index + 1, 0x9e3779b1) ^ Math.imul(plays + bids * 97 + 1, 0x85ebca6b) ^ (seat << 24));
}

/** Pick the candidate with the best mean utility; exact ties go to `prefer`, else the first. */
function pickBest<T>(cands: readonly T[], scores: readonly number[], prefer: T): T {
  let best = -Infinity;
  for (const s of scores) best = Math.max(best, s);
  const top = cands.filter((_, i) => scores[i] >= best - 1e-9);
  return top.includes(prefer) ? prefer : top[0];
}

/** Bid by simulating the round for each plausible bid over sampled deals. */
export function botBid(state: GameState, seat: number, opts: BotOptions = {}): number {
  const r = state.round;
  const hand = r.hands[seat];
  const n = state.n;
  const est = heuristicEstimate(hand, r.trump, n);
  const legal = legalBids(r, seat);
  let cands = legal.filter((b) => Math.abs(b - est) <= 2.5);
  if (!cands.length) cands = [legal.reduce((a, b) => (Math.abs(b - est) < Math.abs(a - est) ? b : a))];
  const fallback = heuristicBid(hand, r.trump, r.cards, n, hookedBid(r, seat));
  if (cands.length === 1) return cands[0];

  const samples = opts.samples ?? clamp(Math.floor(BUDGET / (cands.length * n * r.cards)), 16, 200);
  const rand = rngFor(state, seat);
  const belief = beliefFor(state, seat);
  const order = biddingOrder(r.dealer, n);
  const after = order.slice(order.indexOf(seat) + 1);
  const weights = threatWeights(state.totals, seat);
  const scores = cands.map(() => 0);

  for (let k = 0; k < samples; k++) {
    const world = sampleWorld(belief, rand);
    world[seat] = [...hand];
    cands.forEach((b, ci) => {
      const bids = r.bids.map((x) => x ?? 0);
      const placed: (number | null)[] = [...r.bids];
      bids[seat] = placed[seat] = b;
      for (const s of after) {
        const hooked = hookedBid({ bids: placed, dealer: r.dealer, cards: r.cards }, s);
        bids[s] = placed[s] = heuristicBid(world[s], r.trump, r.cards, n, hooked);
      }
      const sim: Sim = {
        n,
        cards: r.cards,
        trump: r.trump,
        bids,
        won: Array(n).fill(0),
        hands: world.map((h) => [...h]),
        plays: [],
        turn: order[0],
        tricksDone: 0,
        live: new Set(world.flat()),
      };
      rollout(sim);
      scores[ci] += utility(sim, seat, weights);
    });
  }
  return pickBest(cands, scores, fallback);
}

/** Choose a card by playing out sampled worlds for each distinct legal option. */
export function botPlay(state: GameState, seat: number, opts: BotOptions = {}): Card {
  const r = state.round;
  const hand = r.hands[seat];
  const plays = openTrick(r)?.plays ?? [];
  const legal = legalCards(hand, ledSuit(plays));
  if (legal.length === 1) return legal[0];

  const belief = beliefFor(state, seat);
  const cands = distinct(legal, new Set(belief.pool));
  const tricksDone = r.tricks.filter((t) => t.winner !== null).length;
  const base: Sim = {
    n: state.n,
    cards: r.cards,
    trump: r.trump,
    bids: r.bids.map((b) => b ?? 0),
    won: [...r.won],
    hands: [],
    plays: [...plays],
    turn: seat,
    tricksDone,
    live: new Set(),
  };
  // What the policy itself would do here, using only the bot's own hand: the tie-breaker.
  const prefer = policyMove({ ...base, hands: Object.assign([], { [seat]: hand }), live: new Set([...belief.pool, ...hand]) });
  if (cands.length === 1) return cands[0];

  const remaining = (r.cards - tricksDone) * state.n - plays.length;
  const samples = opts.samples ?? clamp(Math.floor(BUDGET / (cands.length * remaining)), 24, 400);
  const rand = rngFor(state, seat);
  const weights = threatWeights(state.totals, seat);
  const scores = cands.map(() => 0);

  for (let k = 0; k < samples; k++) {
    const world = sampleWorld(belief, rand);
    world[seat] = [...hand];
    const sim: Sim = { ...base, hands: world, live: new Set(world.flat()) };
    cands.forEach((c, ci) => {
      const s = cloneSim(sim);
      step(s, c);
      rollout(s);
      scores[ci] += utility(s, seat, weights);
    });
  }
  return pickBest(cands, scores, cands.includes(prefer) ? prefer : equivalent(prefer, cands, belief.pool));
}

/**
 * Collapse cards that are interchangeable: same suit with no unseen card ranked between them.
 * Keeps the lowest card of each run.
 */
function distinct(legal: readonly Card[], unseen: ReadonlySet<Card>): Card[] {
  const sorted = [...legal].sort((a, b) => suitOf(a).localeCompare(suitOf(b)) || rankOf(a) - rankOf(b));
  const out: Card[] = [];
  for (const c of sorted) {
    const prev = out[out.length - 1];
    if (prev && suitOf(prev) === suitOf(c) && !gap(prev, c, unseen)) continue;
    out.push(c);
  }
  return out;
}

function gap(lo: Card, hi: Card, unseen: ReadonlySet<Card>): boolean {
  for (const u of unseen) if (suitOf(u) === suitOf(lo) && rankOf(u) > rankOf(lo) && rankOf(u) < rankOf(hi)) return true;
  return false;
}

/** The representative in `cands` of the run containing `card`. */
function equivalent(card: Card, cands: readonly Card[], pool: readonly Card[]): Card {
  const unseen = new Set(pool);
  const same = cands.filter((c) => suitOf(c) === suitOf(card) && rankOf(c) <= rankOf(card) && !gap(c, card, unseen));
  return same.length ? same[same.length - 1] : cands[0];
}
