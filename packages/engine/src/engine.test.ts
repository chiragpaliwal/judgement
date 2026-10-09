import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  applyAction,
  beats,
  botBid,
  botPlay,
  createGame,
  facts,
  DEFAULT_START_CARDS,
  fullDeck,
  hookedBid,
  isOut,
  legalBids,
  legalCards,
  maxCardsFor,
  roundPlan,
  scoreFor,
  status,
  tableBalance,
  trickWinner,
  trumpFor,
  viewFor,
  voids,
  wouldLead,
  type Card,
  type GameState,
  type Settings,
} from './index';

const settings = (o: Partial<Settings> = {}): Settings => ({ startCards: 8, tracker: true, turnTimer: 0, ...o });

describe('schedule', () => {
  it('rotates trump Hearts, Spades, Diamonds, Clubs', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(trumpFor)).toEqual(['h', 's', 'd', 'c', 'h', 's', 'd', 'c']);
  });

  it('counts down from min(start, floor(52/n)) to 1', () => {
    expect(roundPlan(8, 4)).toEqual([8, 7, 6, 5, 4, 3, 2, 1]);
    expect(roundPlan(8, 7)).toEqual([7, 6, 5, 4, 3, 2, 1]);
    expect(roundPlan(17, 3)).toHaveLength(17);
    expect(roundPlan(20, 3)[0]).toBe(17);
    for (let n = 3; n <= 7; n++) {
      const p = roundPlan(52, n);
      expect(p[0]).toBe(maxCardsFor(n));
      expect(p[p.length - 1]).toBe(1);
    }
  });

  it('deals the full deck by default', () => {
    expect(roundPlan(DEFAULT_START_CARDS, 4)[0]).toBe(13);
    for (let n = 3; n <= 7; n++) expect(roundPlan(DEFAULT_START_CARDS, n)[0]).toBe(maxCardsFor(n));
  });
});

describe('tricks', () => {
  it('highest trump wins, else highest of led suit', () => {
    expect(trickWinner([{ seat: 0, card: 'Kd' }, { seat: 1, card: 'Ad' }, { seat: 2, card: '2h' }], 'h')).toBe(2);
    expect(trickWinner([{ seat: 0, card: 'Kd' }, { seat: 1, card: 'Ad' }, { seat: 2, card: 'As' }], 'h')).toBe(1);
    expect(trickWinner([{ seat: 0, card: '2c' }, { seat: 1, card: 'Ad' }, { seat: 2, card: '3h' }, { seat: 3, card: 'Qh' }], 'h')).toBe(3);
  });

  it('off-suit non-trump never beats', () => {
    expect(beats('As', '2d', 'd', 'h')).toBe(false);
    expect(beats('2h', 'Ad', 'd', 'h')).toBe(true);
  });

  it('must follow suit if able', () => {
    const hand: Card[] = ['As', '9s', 'Qh', 'Jd', '7d'];
    expect(legalCards(hand, 'd')).toEqual(['Jd', '7d']);
    expect(legalCards(hand, 'c')).toEqual(hand);
    expect(legalCards(hand, null)).toEqual(hand);
  });

  it('wouldLead compares against the current winner', () => {
    const plays = [{ seat: 0, card: 'Td' as Card }, { seat: 1, card: '6c' as Card }, { seat: 2, card: 'Kd' as Card }];
    expect(wouldLead('Jd', plays, 's')).toBe(false);
    expect(wouldLead('Ad', plays, 's')).toBe(true);
    expect(wouldLead('2s', plays, 's')).toBe(true);
  });
});

describe('bidding', () => {
  it('hooks only the dealer', () => {
    const r = { cards: 4, dealer: 3, bids: [0, 1, 2, null] };
    expect(hookedBid(r, 3)).toBe(1);
    expect(hookedBid(r, 0)).toBeNull();
    expect(legalBids(r, 3)).toEqual([0, 2, 3, 4]);
  });

  it('no hook when others already over-bid', () => {
    const r = { cards: 3, dealer: 2, bids: [3, 2, null] };
    expect(hookedBid(r, 2)).toBeNull();
    expect(legalBids(r, 2)).toEqual([0, 1, 2, 3]);
  });

  it('1-card round still hooks', () => {
    expect(legalBids({ cards: 1, dealer: 2, bids: [0, 0, null] }, 2)).toEqual([0]);
    expect(legalBids({ cards: 1, dealer: 2, bids: [1, 0, null] }, 2)).toEqual([1]);
    expect(legalBids({ cards: 1, dealer: 2, bids: [1, 1, null] }, 2)).toEqual([0, 1]);
  });

  it('reducer rejects hooked bid and out-of-turn bids', () => {
    let { state } = createGame(3, settings({ startCards: 2 }), 42, 0);
    // dealer 0, so order: 1, 2, 0
    expect(applyAction(state, { type: 'bid', seat: 0, bid: 1 })).toMatchObject({ ok: false, error: 'not_your_turn' });
    state = ok(applyAction(state, { type: 'bid', seat: 1, bid: 1 }));
    state = ok(applyAction(state, { type: 'bid', seat: 2, bid: 0 }));
    expect(applyAction(state, { type: 'bid', seat: 0, bid: 1 })).toMatchObject({ ok: false, error: 'hooked' });
    expect(applyAction(state, { type: 'bid', seat: 0, bid: 3 })).toMatchObject({ ok: false, error: 'bad_bid' });
    state = ok(applyAction(state, { type: 'bid', seat: 0, bid: 2 }));
    expect(state.phase).toBe('playing');
    expect(state.round.turn).toBe(1);
  });
});

describe('scoring', () => {
  it('exact = 10 + bid, else 0', () => {
    expect(scoreFor(0, 0)).toBe(10);
    expect(scoreFor(3, 3)).toBe(13);
    expect(scoreFor(2, 3)).toBe(0);
    expect(scoreFor(2, 1)).toBe(0);
  });
});

describe('derive', () => {
  const r = {
    cards: 8,
    bids: [2, 0, 2, 0, 2, 1],
    won: [0, 0, 0, 1, 0, 1],
    tricks: [
      { leader: 0, plays: [], winner: 3 },
      { leader: 3, plays: [], winner: 5 },
    ],
  };
  it('status and out', () => {
    expect(status(r, 0)).toBe('needs');
    expect(status(r, 1)).toBe('dodge');
    expect(status(r, 3)).toBe('out');
    expect(status(r, 5)).toBe('hold');
    expect(isOut(r, 3)).toBe(true);
  });
  it('table balance', () => {
    // needed = 2 + 2 + 2 = 6 (seat 3 is out), left = 6
    expect(tableBalance(r)).toBe(0);
  });
  it('voids from failures to follow', () => {
    const v = voids([{ leader: 0, plays: [{ seat: 0, card: 'Td' }, { seat: 1, card: '6c' }, { seat: 2, card: 'Kd' }], winner: null }], 3);
    expect(v).toEqual([[], ['d'], []]);
  });
  it('facts', () => {
    const f = facts(['As', '9s', '4s', 'Kh', 'Qh', '5h', 'Jd', '7d'], 's', 0, 4, 6);
    expect(f.trump).toEqual(['As', '9s', '4s']);
    expect(f.voids).toEqual(['c']);
    expect(f.high).toEqual(['As', 'Kh']);
    expect(f.biddersAfter).toEqual([1, 2, 3, 4]);
    expect(f.leader).toBe(5);
  });
});

function ok(res: ReturnType<typeof applyAction>): GameState {
  if (!res.ok) throw new Error(res.error);
  return res.state;
}

function playOut(n: number, start: number, seed: number, firstDealer: number, tracker: boolean) {
  let { state } = createGame(n, settings({ startCards: start, tracker }), seed, firstDealer);
  let steps = 0;
  const expectedTotals = Array(n).fill(0);
  while (state.phase !== 'gameEnd') {
    if (++steps > 5000) throw new Error('did not terminate');
    const r = state.round;
    // Deal sanity.
    if (state.phase === 'bidding' && r.bids.every((b) => b === null)) {
      const all = r.hands.flat();
      expect(new Set(all).size).toBe(n * r.cards);
      for (const h of r.hands) expect(h).toHaveLength(r.cards);
      for (const c of all) expect(fullDeck()).toContain(c);
    }
    if (state.phase === 'bidding') {
      const bid = botBid(state, r.turn);
      expect(legalBids(r, r.turn)).toContain(bid);
      state = ok(applyAction(state, { type: 'bid', seat: r.turn, bid }));
      if (state.phase === 'playing') {
        const sum = state.round.bids.reduce<number>((a, b) => a + (b ?? 0), 0);
        expect(sum).not.toBe(state.round.cards); // hook invariant
      }
    } else if (state.phase === 'playing') {
      const seat = r.turn;
      const card = botPlay(state, seat);
      const open = r.tricks[r.tricks.length - 1];
      const led = open && open.winner === null && open.plays.length ? open.plays[0].card[1] : null;
      expect(legalCards(r.hands[seat], led as never)).toContain(card);
      // Redaction: other players' cards never appear in this viewer's view.
      const v = viewFor(state, seat);
      const others = r.hands.filter((_, i) => i !== seat).flat();
      expect(v.round.hand.some((c) => others.includes(c))).toBe(false);
      expect(JSON.stringify(v)).not.toContain('"seed"');
      state = ok(applyAction(state, { type: 'play', seat, card }));
      if (state.phase === 'roundEnd' || state.phase === 'gameEnd') {
        const rec = state.history[state.history.length - 1];
        expect(rec.won.reduce((a, b) => a + b, 0)).toBe(rec.cards);
        rec.bids.forEach((b, i) => (expectedTotals[i] += b === rec.won[i] ? 10 + b : 0));
        expect(state.totals).toEqual(expectedTotals);
      }
    } else if (state.phase === 'roundEnd') {
      state = ok(applyAction(state, { type: 'nextRound' }));
    }
  }
  expect(state.history).toHaveLength(state.plan.length);
  state.history.forEach((h, i) => {
    expect(h.trump).toBe(trumpFor(i));
    expect(h.dealer).toBe((firstDealer + i) % n);
  });
  return state;
}

describe('full games (property)', () => {
  it('bots play legal, terminating, correctly scored games', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 3, max: 7 }),
        fc.integer({ min: 1, max: 17 }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: 0, max: 6 }),
        fc.boolean(),
        (n, start, seed, fd, tracker) => {
          playOut(n, start, seed, fd % n, tracker);
        },
      ),
      { numRuns: 60 },
    );
  });

  it('tracker off hides older tricks', () => {
    let { state } = createGame(4, settings({ tracker: false }), 7, 0);
    while (state.phase === 'bidding') state = ok(applyAction(state, { type: 'bid', seat: state.round.turn, bid: botBid(state, state.round.turn) }));
    for (let i = 0; i < 4 * 3; i++) state = ok(applyAction(state, { type: 'play', seat: state.round.turn, card: botPlay(state, state.round.turn) }));
    const v = viewFor(state, 0);
    expect(v.round.tricksDone).toBe(3);
    expect(v.round.tricks.length).toBe(2);
    expect(v.round.firstTrickIndex).toBe(2);
  });
});
