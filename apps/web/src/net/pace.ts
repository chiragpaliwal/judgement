import type { GameEvent } from '@judgement/engine';

/** How long to let an applied update animate before showing the next queued one. */
const GAP_MS: Partial<Record<GameEvent['type'], number>> = {
  bid: 450,
  play: 450,
  dealt: 900,
};
/**
 * Once updates pile up, play them back faster so the table catches up, but never so fast that a
 * card is replaced before it lands (~250ms flight) or a won trick vanishes before it registers.
 */
const CATCH_UP_MS: Partial<Record<GameEvent['type'], number>> = {
  bid: 150,
  play: 300,
  trickWon: 500,
  dealt: 450,
};
export const CATCH_UP_BACKLOG = 3;
export const CATCH_UP_AGE_MS = 3_000;
/** Beyond this the replay isn't worth watching: show the latest state straight away. */
export const FLUSH_BACKLOG = 12;

/**
 * How long an applied update with `events` keeps the table busy before the next update may be
 * shown. Updates normally arrive one at a time, already paced further apart than this by the
 * server, so it only bites when a slow link delivers several at once, which would otherwise
 * render as a single jump.
 *
 * @param backlog states still queued after this one (more may arrive while it animates)
 * @param oldestAgeMs how long the oldest queued state has been waiting
 * @param trickHoldMs the client's trick hold, used after a trick is won
 */
export function nextGap(events: GameEvent[], backlog: number, oldestAgeMs: number, trickHoldMs: number): number {
  if (backlog > FLUSH_BACKLOG) return 0;
  const catchUp = backlog > CATCH_UP_BACKLOG || oldestAgeMs > CATCH_UP_AGE_MS;
  let gap = 0;
  for (const e of events) {
    const full = e.type === 'trickWon' ? trickHoldMs : (GAP_MS[e.type] ?? 0);
    gap = Math.max(gap, catchUp ? Math.min(full, CATCH_UP_MS[e.type] ?? 0) : full);
  }
  return gap;
}
