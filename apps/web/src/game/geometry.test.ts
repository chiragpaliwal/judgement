import { describe, expect, it } from 'vitest';
import { fanLayout, needsTiers, tableLayout, tierLayout } from './geometry';

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

  it('short 4-player table: the pill band clears the seat across and yours', () => {
    // Bid sheet open on a phone: the table is squeezed to ~180px.
    const t = tableLayout(4, 378, 180, false);
    expect(t.topSide).toBe(true);
    const top = t.seats[2];
    expect(t.pill.top).toBeGreaterThanOrEqual(top.y + 21 + 6);
    expect(t.pill.bottom).toBeLessThanOrEqual(t.seats[0].y - 21 - 6);
    // Room for at least the chip and the bid bar.
    expect(t.pill.bottom - t.pill.top).toBeGreaterThanOrEqual(30);
  });

  it('trick cards never sit on the seat across or yours', () => {
    for (const H of [260, 320, 380, 484]) {
      const t = tableLayout(4, 378, H, false, true);
      expect(t.cards[2].y - 32).toBeGreaterThan(t.seats[2].y + 21);
      expect(t.cards[0].y + 32).toBeLessThan(t.seats[0].y - 21);
    }
  });

  it('13 cards split into two staggered rows; 8 stay one fan', () => {
    expect(needsTiers(8, 378, 60)).toBe(false);
    expect(needsTiers(13, 378, 60)).toBe(true);
    const f = tierLayout(13, 378, 60, 84);
    expect(f.filter((c) => c.back)).toHaveLength(7);
    expect(f[0].drop).toBeLessThan(f[7].drop - 30);
    // Front row starts half a step in from the back row.
    expect(f[7].x - f[0].x).toBeCloseTo((f[1].x - f[0].x) / 2);
  });
});
