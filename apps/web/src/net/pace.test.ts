import { describe, expect, it } from 'vitest';
import type { GameEvent } from '@judgement/engine';
import { CATCH_UP_AGE_MS, CATCH_UP_BACKLOG, FLUSH_BACKLOG, nextGap } from './pace';

const HOLD = 1000;
const bid: GameEvent = { type: 'bid', seat: 1, bid: 2 };
const play: GameEvent = { type: 'play', seat: 1, card: 'AS' as never };
const won: GameEvent = { type: 'trickWon', seat: 1, trick: 0 };
const dealt: GameEvent = { type: 'dealt', round: 0, cards: 5, trump: 'S' as never, dealer: 0 };

describe('nextGap', () => {
  it('lets a bid or play animate before the next update, queued or not', () => {
    expect(nextGap([bid], 0, 0, HOLD)).toBe(450);
    expect(nextGap([bid], 1, 0, HOLD)).toBe(450);
    expect(nextGap([play], 2, 100, HOLD)).toBe(450);
  });
  it('holds a won trick and a fresh deal longer', () => {
    expect(nextGap([play, won], 1, 0, HOLD)).toBe(HOLD);
    expect(nextGap([dealt], 1, 0, HOLD)).toBe(900);
  });
  it('does not wait after updates with nothing to animate', () => {
    expect(nextGap([], 3, 0, HOLD)).toBe(0);
    expect(nextGap([{ type: 'gameOver' }], 1, 0, HOLD)).toBe(0);
  });
  it('speeds up when updates pile up or are stale', () => {
    expect(nextGap([bid], CATCH_UP_BACKLOG + 1, 0, HOLD)).toBe(150);
    expect(nextGap([dealt], CATCH_UP_BACKLOG + 1, 0, HOLD)).toBe(450);
  });
  it('still lets a card land and a won trick show while catching up', () => {
    expect(nextGap([play], CATCH_UP_BACKLOG + 1, 0, HOLD)).toBe(300);
    expect(nextGap([play, won], 1, CATCH_UP_AGE_MS + 1, HOLD)).toBe(500);
    expect(nextGap([won], 1, CATCH_UP_AGE_MS + 1, 200)).toBe(200);
  });
  it('skips the replay entirely after a long stall', () => {
    expect(nextGap([bid], FLUSH_BACKLOG + 1, 0, HOLD)).toBe(0);
  });
});
