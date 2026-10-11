import type { Card, Suit } from './cards';

export type TurnTimer = 0 | 30 | 60;

/** classic: exact = 10 + bid, miss = 0. stakes: ±(11 × bid + 10), i.e. 21 for bid 1, 109 for bid 9. */
export type ScoringMode = 'classic' | 'stakes';

export interface Settings {
  /** Cards dealt in round 1 (capped by floor(52 / players)). */
  startCards: number;
  /** "Cards seen" tracker available to everyone. */
  tracker: boolean;
  /** Seconds per action, 0 = off. */
  turnTimer: TurnTimer;
  /** Absent on games saved before scoring modes existed: treat as classic. */
  scoring: ScoringMode;
  /** Table chat on. Absent on rooms saved before it existed: treat as on. */
  chat?: boolean;
}

export interface Play {
  seat: number;
  card: Card;
}

export interface Trick {
  leader: number;
  plays: Play[];
  /** Seat that won, null while the trick is open. */
  winner: number | null;
}

export interface Round {
  index: number;
  cards: number;
  trump: Suit;
  dealer: number;
  bids: (number | null)[];
  won: number[];
  hands: Card[][];
  /** Completed tricks plus the open one (last, winner === null). */
  tricks: Trick[];
  /** Seat to act (bid or play). */
  turn: number;
}

export interface RoundRecord {
  index: number;
  cards: number;
  trump: Suit;
  dealer: number;
  bids: number[];
  won: number[];
  points: number[];
}

export type Phase = 'bidding' | 'playing' | 'roundEnd' | 'gameEnd';

export interface GameState {
  /** Number of seats. Seats are 0..n-1 in clockwise order. */
  n: number;
  settings: Settings;
  plan: number[];
  firstDealer: number;
  seed: number;
  phase: Phase;
  round: Round;
  history: RoundRecord[];
  totals: number[];
}

export type Action =
  | { type: 'bid'; seat: number; bid: number }
  | { type: 'play'; seat: number; card: Card }
  | { type: 'nextRound' };

export type GameEvent =
  | { type: 'dealt'; round: number; cards: number; trump: Suit; dealer: number }
  | { type: 'bid'; seat: number; bid: number }
  | { type: 'play'; seat: number; card: Card }
  | { type: 'trickWon'; seat: number; trick: number }
  | { type: 'roundScored'; round: number; points: number[] }
  | { type: 'gameOver' };

export type ActionError =
  | 'wrong_phase'
  | 'not_your_turn'
  | 'bad_bid'
  | 'hooked'
  | 'not_in_hand'
  | 'must_follow';

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: ActionError };
