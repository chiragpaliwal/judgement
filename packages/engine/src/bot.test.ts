import { describe, expect, it } from 'vitest';
import {
  applyAction,
  beats,
  botBid,
  botPlay,
  createGame,
  hookedBid,
  ledSuit,
  legalBids,
  legalCards,
  lowestCard,
  openTrick,
  rankOf,
  shuffle,
  mulberry32,
  suitOf,
  SUITS,
  winningIndex,
  type Card,
  type GameState,
  type Round,
} from './index';
import { clone } from './clone';
import { need } from './derive';

// The engine builds without DOM/Node typings; the benchmark only needs these.
declare const process: { env: Record<string, string | undefined> };
declare const performance: { now(): number };
declare const console: { log(...args: unknown[]): void };

const settings = { startCards: 3, tracker: true, turnTimer: 0 as const };

/** A 3-seat state mid-round, built from explicit hands and tricks. */
function scenario(round: Partial<Round>): GameState {
  const { state } = createGame(3, settings, 42, 0);
  state.phase = 'playing';
  state.round = { ...state.round, trump: 'h', dealer: 2, ...round };
  return state;
}

describe('bot tactics', () => {
  // Trick 1: seat 0 led 4c, seat 1 won with Ac.
  const trick1 = { leader: 0, plays: [{ seat: 0, card: '4c' as Card }, { seat: 1, card: 'Ac' as Card }, { seat: 2, card: '5c' as Card }], winner: 1 };

  it('when already out, plays to spoil an opponent', () => {
    // Bot (seat 0) bid 3 and can no longer make it. Seat 2 bid 0 but its Td is winning the trick.
    // Trumping with 2h (the lowest card) would rescue seat 2; discarding Kc lets it bust.
    const state = scenario({
      cards: 3,
      bids: [3, 1, 0],
      won: [0, 1, 0],
      hands: [['2h', 'Kc'], ['7s'], ['8s']],
      tricks: [trick1, { leader: 1, plays: [{ seat: 1, card: '9d' }, { seat: 2, card: 'Td' }], winner: null }],
      turn: 0,
    });
    expect(botPlay(state, 0)).toBe('Kc');
  });

  it('spoils with a spare card when its own bid stays safe', () => {
    // Bot needs 1 and holds the top trump. Discarding 3c lets 9d bust seat 1 (bid 1, has 1);
    // Ah still takes the last trick for the bot.
    const state = scenario({
      cards: 3,
      bids: [1, 1, 0],
      won: [0, 1, 0],
      hands: [['Ah', '3c'], ['7d'], ['8s']],
      tricks: [trick1, { leader: 1, plays: [{ seat: 1, card: '9d' }, { seat: 2, card: '2d' }], winner: null }],
      turn: 0,
    });
    expect(botPlay(state, 0)).toBe('3c');
  });

  it('never gives up its own bid to spoil', () => {
    // Same spot, but the bot needs both tricks: it must take this one.
    const state = scenario({
      cards: 3,
      bids: [2, 1, 0],
      won: [0, 1, 0],
      hands: [['Ah', '3c'], ['7d'], ['8s']],
      tricks: [trick1, { leader: 1, plays: [{ seat: 1, card: '9d' }, { seat: 2, card: '2d' }], winner: null }],
      turn: 0,
    });
    expect(botPlay(state, 0)).toBe('Ah');
  });

  it('decides from public information only', () => {
    let { state } = createGame(4, { ...settings, startCards: 8 }, 7, 0);
    while (state.phase === 'bidding') state = step(state, botBid(state, state.round.turn, { samples: 8 }));
    for (let i = 0; i < 9; i++) state = step(state, botPlay(state, state.round.turn, { samples: 8 }));
    const seat = state.round.turn;
    const before = botPlay(state, seat, { samples: 16 });
    // Redistribute the other seats' hidden cards (same sizes); the decision must not change.
    const others = [0, 1, 2, 3].filter((s) => s !== seat);
    const pool = shuffle(others.flatMap((s) => state.round.hands[s]), mulberry32(99));
    const mixed = clone(state);
    for (const s of others) mixed.round.hands[s] = pool.splice(0, state.round.hands[s].length);
    expect(botPlay(mixed, seat, { samples: 16 })).toBe(before);
  });
});

function step(state: GameState, x: number | Card): GameState {
  const seat = state.round.turn;
  const res = applyAction(state, typeof x === 'number' ? { type: 'bid', seat, bid: x } : { type: 'play', seat, card: x });
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

// ---------- benchmark: new bots vs the previous heuristic ----------

/** The bot as it was before search was added, kept verbatim as a baseline. */
function legacyBid(state: GameState, seat: number): number {
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
      if (hand.filter((c) => suitOf(c) === s).length <= 1) est += 0.5;
    }
  }
  est *= Math.max(0.6, 1 - (state.n - 4) * 0.06);
  let bid = Math.max(0, Math.min(r.cards, Math.round(est)));
  if (hookedBid(r, seat) === bid) {
    const options = legalBids(r, seat);
    bid = options.reduce((best, b) => (Math.abs(b - est) < Math.abs(best - est) ? b : best), options[0]);
  }
  return bid;
}

function legacyPlay(state: GameState, seat: number): Card {
  const r = state.round;
  const hand = r.hands[seat];
  const plays = openTrick(r)?.plays ?? [];
  const legal = legalCards(hand, ledSuit(plays));
  const bid = r.bids[seat] ?? 0;
  const won = r.won[seat];
  const left = r.cards - r.tricks.filter((t) => t.winner !== null).length;
  const out = won > bid || bid - won > left;
  const wants = !out && need(bid, won) > 0;
  const asc = (a: Card, b: Card) => rankOf(a) - rankOf(b) || (suitOf(a) === r.trump ? 1 : 0) - (suitOf(b) === r.trump ? 1 : 0);
  if (out) return lowestCard(legal, r.trump);
  if (!plays.length) {
    if (wants) {
      const sure = legal.filter((c) => rankOf(c) === 14 || (suitOf(c) === r.trump && rankOf(c) >= 12));
      if (sure.length) return sure.sort(asc)[sure.length - 1];
      return [...legal].sort(asc)[legal.length - 1];
    }
    return lowestCard(legal, r.trump);
  }
  const led = suitOf(plays[0].card);
  const best = plays[winningIndex(plays, r.trump)].card;
  const winners = legal.filter((c) => beats(c, best, led, r.trump)).sort(asc);
  const losers = legal.filter((c) => !beats(c, best, led, r.trump)).sort(asc);
  if (wants) {
    if (winners.length) return plays.length === state.n - 1 ? winners[0] : winners[winners.length - 1];
    return losers.length ? losers[0] : lowestCard(legal, r.trump);
  }
  if (losers.length) return losers[losers.length - 1];
  return winners[winners.length - 1];
}

describe.skipIf(!process.env.BENCH)('bot strength benchmark', () => {
  it('search bots beat the legacy heuristic', () => {
    const games = Number(process.env.BENCH_GAMES ?? 100);
    const n = Number(process.env.BENCH_N ?? 4);
    const start = Number(process.env.BENCH_START ?? 7);
    const tally = { new: { pts: 0, made: 0, rounds: 0 }, old: { pts: 0, made: 0, rounds: 0 } };
    const times: number[] = [];
    for (let g = 0; g < games; g++) {
      // Alternate which seats run the new bot so seating position evens out.
      const isNew = (s: number) => (s + g) % 2 === 0;
      let { state } = createGame(n, { ...settings, startCards: start }, 1000 + g, g % n);
      while (state.phase !== 'gameEnd') {
        if (state.phase === 'roundEnd') {
          state = applyOk(state, { type: 'nextRound' });
          continue;
        }
        const seat = state.round.turn;
        if (state.phase === 'bidding') {
          state = step(state, isNew(seat) ? botBid(state, seat) : legacyBid(state, seat));
        } else {
          const t0 = performance.now();
          const card = isNew(seat) ? botPlay(state, seat) : legacyPlay(state, seat);
          if (isNew(seat)) times.push(performance.now() - t0);
          state = step(state, card);
        }
      }
      for (const h of state.history)
        h.bids.forEach((b, s) => {
          const t = isNew(s) ? tally.new : tally.old;
          t.rounds++;
          if (b === h.won[s]) t.made++;
        });
      state.totals.forEach((p, s) => (isNew(s) ? tally.new : tally.old).pts += p);
    }
    times.sort((a, b) => a - b);
    const fmt = (t: typeof tally.new) => `make ${((100 * t.made) / t.rounds).toFixed(1)}%  pts/game/seat ${(t.pts / (t.rounds / start)).toFixed(1)}`;
    console.log(`n=${n} start=${start} games=${games}\n  new: ${fmt(tally.new)}\n  old: ${fmt(tally.old)}\n  botPlay p50 ${times[times.length >> 1].toFixed(1)}ms p95 ${times[Math.floor(times.length * 0.95)].toFixed(1)}ms`);
    expect(tally.new.pts).toBeGreaterThan(tally.old.pts);
  }, 600_000);
});

function applyOk(state: GameState, action: Parameters<typeof applyAction>[1]): GameState {
  const res = applyAction(state, action);
  if (!res.ok) throw new Error(res.error);
  return res.state;
}
