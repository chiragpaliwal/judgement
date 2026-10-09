import { fullDeck, sortHand, type Card } from './cards';
import { mulberry32, roundSeed, shuffle } from './rng';
import { roundPlan, trumpFor } from './schedule';
import {
  hookedBid,
  isLegalPlay,
  ledSuit,
  nextSeat,
  openTrick,
  scoreFor,
  trickWinner,
} from './rules';
import { clone } from './clone';
import type { Action, ApplyResult, GameEvent, GameState, Round, Settings } from './types';

function dealRound(n: number, plan: number[], firstDealer: number, seed: number, index: number): Round {
  const cards = plan[index];
  const trump = trumpFor(index);
  const dealer = (firstDealer + index) % n;
  const deck = shuffle(fullDeck(), mulberry32(roundSeed(seed, index)));
  const hands: Card[][] = Array.from({ length: n }, () => []);
  // Deal one card at a time starting left of the dealer.
  for (let c = 0; c < cards; c++) {
    for (let i = 0; i < n; i++) hands[(dealer + 1 + i) % n].push(deck[c * n + i]);
  }
  return {
    index,
    cards,
    trump,
    dealer,
    bids: Array(n).fill(null),
    won: Array(n).fill(0),
    hands: hands.map((h) => sortHand(h, trump)),
    tricks: [],
    turn: nextSeat(dealer, n),
  };
}

const dealtEvent = (r: Round): GameEvent => ({
  type: 'dealt',
  round: r.index,
  cards: r.cards,
  trump: r.trump,
  dealer: r.dealer,
});

export function createGame(n: number, settings: Settings, seed: number, firstDealer = 0): { state: GameState; events: GameEvent[] } {
  const plan = roundPlan(settings.startCards, n);
  const round = dealRound(n, plan, firstDealer, seed, 0);
  const state: GameState = {
    n,
    settings: { ...settings },
    plan,
    firstDealer,
    seed,
    phase: 'bidding',
    round,
    history: [],
    totals: Array(n).fill(0),
  };
  return { state, events: [dealtEvent(round)] };
}

export function applyAction(prev: GameState, action: Action): ApplyResult {
  const state = clone(prev);
  const r = state.round;
  const events: GameEvent[] = [];

  switch (action.type) {
    case 'bid': {
      if (state.phase !== 'bidding') return { ok: false, error: 'wrong_phase' };
      if (action.seat !== r.turn) return { ok: false, error: 'not_your_turn' };
      const b = action.bid;
      if (!Number.isInteger(b) || b < 0 || b > r.cards) return { ok: false, error: 'bad_bid' };
      if (hookedBid(r, action.seat) === b) return { ok: false, error: 'hooked' };
      r.bids[action.seat] = b;
      events.push({ type: 'bid', seat: action.seat, bid: b });
      if (action.seat === r.dealer) {
        state.phase = 'playing';
        r.turn = nextSeat(r.dealer, state.n);
        r.tricks.push({ leader: r.turn, plays: [], winner: null });
      } else {
        r.turn = nextSeat(action.seat, state.n);
      }
      return { ok: true, state, events };
    }

    case 'play': {
      if (state.phase !== 'playing') return { ok: false, error: 'wrong_phase' };
      if (action.seat !== r.turn) return { ok: false, error: 'not_your_turn' };
      const hand = r.hands[action.seat];
      if (!hand.includes(action.card)) return { ok: false, error: 'not_in_hand' };
      let trick = openTrick(r);
      if (!trick) {
        trick = { leader: action.seat, plays: [], winner: null };
        r.tricks.push(trick);
      }
      if (!isLegalPlay(hand, ledSuit(trick.plays), action.card)) return { ok: false, error: 'must_follow' };

      r.hands[action.seat] = hand.filter((c) => c !== action.card);
      trick.plays.push({ seat: action.seat, card: action.card });
      events.push({ type: 'play', seat: action.seat, card: action.card });

      if (trick.plays.length < state.n) {
        r.turn = nextSeat(action.seat, state.n);
        return { ok: true, state, events };
      }

      // Trick complete.
      const w = trickWinner(trick.plays, r.trump);
      trick.winner = w;
      r.won[w] += 1;
      r.turn = w;
      events.push({ type: 'trickWon', seat: w, trick: r.tricks.length - 1 });

      if (r.tricks.length < r.cards) {
        r.tricks.push({ leader: w, plays: [], winner: null });
        return { ok: true, state, events };
      }

      // Round complete.
      const bids = r.bids.map((b) => b ?? 0);
      const points = bids.map((b, i) => scoreFor(b, r.won[i]));
      state.history.push({
        index: r.index,
        cards: r.cards,
        trump: r.trump,
        dealer: r.dealer,
        bids,
        won: [...r.won],
        points,
      });
      state.totals = state.totals.map((t, i) => t + points[i]);
      events.push({ type: 'roundScored', round: r.index, points });
      if (r.index + 1 >= state.plan.length) {
        state.phase = 'gameEnd';
        events.push({ type: 'gameOver' });
      } else {
        state.phase = 'roundEnd';
      }
      return { ok: true, state, events };
    }

    case 'nextRound': {
      if (state.phase !== 'roundEnd') return { ok: false, error: 'wrong_phase' };
      state.round = dealRound(state.n, state.plan, state.firstDealer, state.seed, r.index + 1);
      state.phase = 'bidding';
      events.push(dealtEvent(state.round));
      return { ok: true, state, events };
    }
  }
}

/** Seat that must act now, or null if nobody (between rounds / game over). */
export function actingSeat(state: GameState): number | null {
  return state.phase === 'bidding' || state.phase === 'playing' ? state.round.turn : null;
}
