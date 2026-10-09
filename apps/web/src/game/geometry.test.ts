import { describe, expect, it } from 'vitest';
import { fanLayout, tableLayout } from './geometry';

describe('geometry matches the reference renders', () => {
  it('seat and trick positions for 6 players at 366×484', () => {
    const t = tableLayout(6, 366, 484, false);
    // Local player: avatar centre (183, 422); trick card top-left (160, 310) for 46×64.
    expect(t.seats[0].x).toBeCloseTo(183);
    expect(t.seats[0].y).toBeCloseTo(422);
    expect(t.cards[0].x - 23).toBeCloseTo(160);
    expect(t.cards[0].y - 32).toBeCloseTo(310);
    // Top seat (index 3) at (183, 22).
    expect(t.seats[3].y).toBeCloseTo(22);
    expect(t.centre.y).toBeCloseTo(232);
  });

  it('hand fan for 6 cards at 366px', () => {
    const f = fanLayout(6, 366, 70);
    expect(f[0].x).toBeCloseTo(22);
    expect(f[0].rot).toBeCloseTo(-7.5);
    expect(f[0].drop).toBeCloseTo(10);
  });
});
