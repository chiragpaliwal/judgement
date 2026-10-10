// Wire protocol shared by the room server and the web client.
import type { Card } from './cards';
import type { GameEvent, ScoringMode, Settings, TurnTimer } from './types';
import type { GameView } from './view';

export const REACTIONS = ['😂', '👍', '🔥', '👏', '😭', '😡', '😴'] as const;
export type Reaction = (typeof REACTIONS)[number];

/** Offline this long before the table pauses; long enough to ride out one reconnect on a phone. */
export const GRACE_MS = 10_000;
export const HOLD_MS = 60_000;
/** Next round deals this long after the first Ready... */
export const READY_DEAL_MS = 8_000;
/** ...or after this long if nobody taps Ready. */
export const AUTO_DEAL_MS = 30_000;
export const REACTION_COOLDOWN_MS = 2_000;
export const NAME_MAX = 16;

export interface MemberView {
  id: string;
  name: string;
  isBot: boolean;
  isHost: boolean;
  connected: boolean;
  /** Turns are being played automatically for this member. */
  autoplay: boolean;
}

export interface PauseView {
  playerId: string;
  /** Epoch ms when the seat hold ends. */
  holdUntil: number;
  votes: string[];
  /** Hold ran out; the host decides. */
  expired: boolean;
}

export interface RoomView {
  code: string;
  you: string | null;
  hostId: string;
  /** Seat order. During a game, seat i = members[i]. */
  members: MemberView[];
  settings: Settings;
  stage: 'lobby' | 'game';
  ready: string[];
  pause: PauseView | null;
  /** Epoch ms when the current turn auto-acts, null if no timer is running. */
  turnDeadline: number | null;
  /** Epoch ms when the next round auto-deals. */
  autoDealAt: number | null;
  /** Game ended early by the host. */
  endedEarly: boolean;
  serverNow: number;
}

export type ServerMsg =
  /** `seq` goes up by one with every state the room sends, so a client can tell whether it missed any. */
  | { type: 'state'; seq: number; room: RoomView; game: GameView | null; events: GameEvent[] }
  | { type: 'reaction'; from: string; emoji: Reaction }
  | { type: 'error'; code: string }
  | { type: 'locked'; reason: 'in_progress' | 'full' }
  | { type: 'no_room' }
  | { type: 'replaced' };

export type ClientMsg =
  | { type: 'setSettings'; startCards?: number; tracker?: boolean; turnTimer?: TurnTimer; scoring?: ScoringMode }
  | { type: 'addBot' }
  | { type: 'removeMember'; id: string }
  | { type: 'start' }
  | { type: 'bid'; bid: number }
  | { type: 'play'; card: Card }
  | { type: 'ready' }
  | { type: 'voteWait' }
  | { type: 'autoplay'; id: string; on: boolean }
  | { type: 'endGame' }
  | { type: 'react'; emoji: Reaction }
  | { type: 'rematch' }
  | { type: 'leave' };

/** Room code alphabet: no 0/O/1/I to avoid confusion. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 4;
export const isRoomCode = (s: string) => new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(s);
