import { describe, expect, it } from 'vitest';
import type { GameView } from '@judgement/engine';
import { bidNote, hintLine, recapLine, sharedRanks, stakeLine, storyLine, waitLine } from './narrate';

const names = ['You', 'Ira', 'Mei', 'Asha', 'Ben', 'Dev'];

function view(partial: Partial<GameView['round']>, phase: GameView['phase'] = 'playing'): GameView {
  return {
    phase,
    n: 6,
    settings: { startCards: 8, tracker: true, turnTimer: 0 },
    plan: [8, 7, 6, 5, 4, 3, 2, 1],
    me: 0,
    history: [],
    totals: [0, 0, 0, 0, 0, 0],
    round: {
      index: 0, cards: 8, trump: 's', dealer: 2, bids: [2, 0, 2, 1, 0, 2], won: [0, 0, 0, 1, 0, 1], turn: 0,
      handCounts: [6, 6, 6, 5, 5, 5], hand: [], tricks: [], firstTrickIndex: 0, tricksDone: 2, ...partial,
    },
  };
}

const trick = { leader: 3, winner: null, plays: [{ seat: 3, card: 'Td' as const }, { seat: 4, card: '6c' as const }, { seat: 5, card: 'Kd' as const }] };

describe('narrate', () => {
  it('hint says whether the selected card takes the lead', () => {
    const g = view({ tricks: [trick] });
    expect(hintLine(g, 'Jd', names)).toBe('The J♦ won’t beat Dev’s K♦. Dev stays on top.');
    expect(hintLine(g, 'Ad', names)).toBe('The A♦ beats Dev’s K♦ and takes the lead.');
    expect(hintLine(g, '2s', names)).toBe('The 2♠ trumps Dev’s K♦ and takes the lead.');
  });

  it('stake line for a zero bidder uses names, not pronouns', () => {
    const g = view({ tricks: [trick], turn: 1 });
    const s = stakeLine(g, 1, names, [[], [], [], [], [], []]);
    expect(s.title).toBe('Ira bid 0.');
    expect(s.body).toBe('Any diamond under Dev’s K♦ keeps Ira clean. Out of diamonds, Ira can throw anything but a spade.');
    expect(s.body).not.toMatch(/\b(he|she|his|her)\b/);
  });

  it('wait line knows when the trick closes', () => {
    const g = view({ tricks: [{ ...trick, plays: [...trick.plays, { seat: 0, card: '7d' }, { seat: 1, card: '2d' }] }], turn: 2 });
    expect(waitLine(g, names)).toBe('Mei plays next, then the trick closes');
  });

  it('bid note names who is left and the hook', () => {
    expect(bidNote(view({ bids: [2, null, null, 2, 0, 3], dealer: 2 }, 'bidding'), names)).toBe('Ira and Mei still to bid');
    expect(bidNote(view({ bids: [null, null, null, null, 0, 3], dealer: 3, turn: 0 }, 'bidding'), names)).toBe('4 still to bid · you’re up');
    expect(bidNote(view({ bids: [2, 1, null, 2, 0, 3], dealer: 2 }, 'bidding'), names)).toBe('Mei deals · can’t make it 8');
  });

  it('recap and story', () => {
    const rec = { index: 0, cards: 8, trump: 's' as const, dealer: 2, bids: [2, 0, 2, 2, 0, 3], won: [2, 0, 0, 2, 1, 3], points: [12, 10, 0, 12, 0, 13] };
    expect(recapLine(rec, names, { leader: 0, plays: [], winner: 5 })).toBe('The table bid 9 into 8 tricks. Dev took the last one to land 3.');
    expect(storyLine([rec], names)).toMatch(/^One point clear of you\./);
    expect(sharedRanks([68, 66, 53, 53])).toEqual([1, 2, 3, 3]);
  });
});
