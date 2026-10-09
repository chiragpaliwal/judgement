import { clone } from './clone';
import type { Card, Suit } from './cards';
import type { GameState, Phase, RoundRecord, Settings, Trick } from './types';

export interface RoundView {
  index: number;
  cards: number;
  trump: Suit;
  dealer: number;
  bids: (number | null)[];
  won: number[];
  turn: number;
  handCounts: number[];
  /** The viewer's own hand (empty for spectators). */
  hand: Card[];
  /**
   * Tricks visible to this viewer. With the tracker on: all of this round.
   * With it off: only the open trick and the most recent completed one.
   */
  tricks: Trick[];
  /** Index (in the round) of tricks[0], so callers can number them. */
  firstTrickIndex: number;
  /** Number of completed tricks this round. */
  tricksDone: number;
}

export interface GameView {
  phase: Phase;
  n: number;
  settings: Settings;
  plan: number[];
  /** Viewer's seat, null for spectators. */
  me: number | null;
  round: RoundView;
  history: RoundRecord[];
  totals: number[];
}

export function viewFor(state: GameState, seat: number | null): GameView {
  const r = state.round;
  const done = r.tricks.filter((t) => t.winner !== null).length;
  let tricks = r.tricks;
  let firstTrickIndex = 0;
  if (!state.settings.tracker && tricks.length > 2) {
    firstTrickIndex = tricks.length - 2;
    tricks = tricks.slice(firstTrickIndex);
  }
  return {
    phase: state.phase,
    n: state.n,
    settings: { ...state.settings },
    plan: [...state.plan],
    me: seat,
    round: {
      index: r.index,
      cards: r.cards,
      trump: r.trump,
      dealer: r.dealer,
      bids: [...r.bids],
      won: [...r.won],
      turn: r.turn,
      handCounts: r.hands.map((h) => h.length),
      hand: seat === null ? [] : [...r.hands[seat]],
      tricks: clone(tricks),
      firstTrickIndex,
      tricksDone: done,
    },
    history: clone(state.history),
    totals: [...state.totals],
  };
}
