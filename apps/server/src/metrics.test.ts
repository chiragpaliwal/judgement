import { describe, expect, it } from 'vitest';
import { places } from './metrics';

describe('places', () => {
  it('ranks highest total first', () => {
    expect(places([30, 50, 10])).toEqual([2, 1, 3]);
  });

  it('gives tied totals the same place and skips the next one', () => {
    expect(places([40, 40, 20, 40])).toEqual([1, 1, 4, 1]);
    expect(places([50, 20, 20, 10])).toEqual([1, 2, 2, 4]);
  });

  it('handles negative stakes totals', () => {
    expect(places([-21, 32, -54])).toEqual([2, 1, 3]);
  });
});
