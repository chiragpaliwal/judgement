// Room logic, independent of Durable Objects so it can be tested with a fake clock.
import {
  applyAction,
  AUTO_DEAL_MS,
  botBid,
  botPlay,
  CHAT_BURST,
  CHAT_MAX,
  CHAT_RATE_MS,
  createGame,
  DEFAULT_START_CARDS,
  GRACE_MS,
  HOLD_MS,
  VOTE_WINDOW_MS,
  ledSuit,
  legalBids,
  legalCards,
  lowestCard,
  MAX_PLAYERS,
  MIN_PLAYERS,
  NAME_MAX,
  openTrick,
  REACTION_COOLDOWN_MS,
  READY_DEAL_MS,
  viewFor as gameViewFor,
  type Action,
  type ChatMsg,
  type ClientMsg,
  type GameEvent,
  type GameState,
  type GameView,
  type Reaction,
  type RoomView,
  type Settings,
} from '@judgement/engine';

export interface Member {
  id: string;
  /** Secret per-device token. Never sent to other clients. */
  deviceId: string;
  name: string;
  isBot: boolean;
  connected: boolean;
  autoplay: boolean;
  offlineSince: number | null;
  lastReaction: number;
  /** Chat token bucket. Missing in rooms saved before chat existed. */
  chatTokens?: number;
  chatAt?: number;
}

export interface RoomState {
  code: string;
  createdAt: number;
  hostId: string;
  members: Member[];
  settings: Settings;
  stage: 'lobby' | 'game';
  game: GameState | null;
  ready: string[];
  pause: { playerId: string; holdUntil: number; votes: string[]; extensions: number; expired: boolean } | null;
  turnDeadline: number | null;
  turnRemaining: number | null;
  botDue: number | null;
  /** Bots wait until animations of a deal / trick have had time to play. */
  settleUntil: number;
  autoDealAt: number | null;
  endedEarly: boolean;
  /** When the current game was started; identifies it in metrics. Missing in rooms saved before it existed. */
  gameStartedAt?: number | null;
  lastActivity: number;
  /** Number of the last state broadcast (see ServerMsg `seq`). Missing in rooms saved before it existed. */
  seq?: number;
  /** Members the host muted for everyone. Missing in rooms saved before chat existed. */
  muted?: string[];
}

export interface Outcome {
  events: GameEvent[];
  error?: string;
  reaction?: { from: string; emoji: Reaction };
  /** A chat message to append to the history and broadcast; the room assigns its id. */
  chat?: Omit<ChatMsg, 'id'>;
  /** Member ids removed by this message (their sockets should be closed). */
  removed?: string[];
  /** True if anything visible changed and a state broadcast is needed. */
  changed: boolean;
}

const BOT_NAMES = ['Ada', 'Raj', 'Kai', 'Zoe', 'Ravi', 'Lea', 'Tom', 'Uma'];
const SETTLE_MS = 1_200;
export const ROOM_TTL_MS = 30 * 60_000;
/** Clients ping every 1s on screen and every 10s in the background; a socket silent this long is treated as gone. */
export const STALE_MS = 30_000;

/** Whether an idle room may be deleted even with sockets open: only in the lobby or on the results screen, never mid-game. */
export function idleExpired(s: RoomState, now: number): boolean {
  return now - s.lastActivity >= ROOM_TTL_MS && (s.stage === 'lobby' || s.game?.phase === 'gameEnd');
}

/**
 * When to set the alarm. Times already past are dropped: they are work tick() could not do, and
 * re-arming for them is what made a room fire every 50ms. An idle room past its TTL rechecks a TTL later.
 */
export function nextAlarm(
  now: number,
  wake: number | null,
  lastActivity: number,
  sweepAt: number | null,
  ttl = ROOM_TTL_MS,
): number {
  const expiry = lastActivity + ttl;
  const times = [wake, expiry > now ? expiry : now + ttl, sweepAt].filter((t): t is number => t !== null && t > now);
  return Math.max(now + 50, Math.min(...times));
}

export type Rand = () => number;

export function newRoomState(code: string, now: number): RoomState {
  return {
    code,
    createdAt: now,
    hostId: '',
    members: [],
    settings: { startCards: DEFAULT_START_CARDS, tracker: true, turnTimer: 0, scoring: 'classic', chat: true },
    stage: 'lobby',
    game: null,
    ready: [],
    pause: null,
    turnDeadline: null,
    turnRemaining: null,
    botDue: null,
    settleUntil: 0,
    autoDealAt: null,
    endedEarly: false,
    gameStartedAt: null,
    lastActivity: now,
    seq: 0,
  };
}

const LINK = /https?:\/\/|www\./i;

export const cleanChat = (raw: string) =>
  raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, CHAT_MAX);

export const cleanName = (raw: string) =>
  raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

const randomId = (rand: Rand) =>
  Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(rand() * 36)]).join('');

export class RoomCore {
  constructor(
    public s: RoomState,
    private rand: Rand = Math.random,
  ) {
    // Rooms saved before scoring modes existed.
    s.settings.scoring ??= 'classic';
  }

  // ---------- helpers ----------
  member(id: string) {
    return this.s.members.find((m) => m.id === id);
  }
  seatOf(id: string) {
    return this.s.members.findIndex((m) => m.id === id);
  }
  private humans() {
    return this.s.members.filter((m) => !m.isBot);
  }
  private gameActive() {
    const p = this.s.game?.phase;
    return this.s.stage === 'game' && (p === 'bidding' || p === 'playing');
  }
  private ok(events: GameEvent[] = [], extra: Partial<Outcome> = {}): Outcome {
    return { events, changed: true, ...extra };
  }
  private err(error: string): Outcome {
    return { events: [], error, changed: false };
  }
  private isHost(id: string) {
    return this.s.hostId === id;
  }

  private resetTurnClock() {
    this.s.turnDeadline = null;
    this.s.turnRemaining = null;
    this.s.botDue = null;
  }

  private applyGame(action: Action, now: number): GameEvent[] | string {
    const g = this.s.game;
    if (!g) return 'no_game';
    const res = applyAction(g, action);
    if (!res.ok) return res.error;
    this.s.game = res.state;
    this.resetTurnClock();
    if (res.events.some((e) => e.type === 'trickWon' || e.type === 'dealt')) this.s.settleUntil = now + SETTLE_MS;
    if (res.state.phase === 'roundEnd') {
      this.s.autoDealAt = now + AUTO_DEAL_MS;
      this.s.ready = this.s.members.filter((m) => m.isBot || m.autoplay).map((m) => m.id);
    } else {
      this.s.autoDealAt = null;
    }
    if (res.state.phase === 'bidding' && action.type === 'nextRound') this.s.ready = [];
    return res.events;
  }

  /** Automatic action for the seat to act: bots use the heuristic, others the lowest legal option. */
  private autoAction(seat: number, smart: boolean): Action {
    const g = this.s.game!;
    const r = g.round;
    if (g.phase === 'bidding') {
      const bid = smart ? botBid(g, seat) : legalBids(r, seat)[0];
      return { type: 'bid', seat, bid };
    }
    const card = smart
      ? botPlay(g, seat)
      : lowestCard(legalCards(r.hands[seat], ledSuit(openTrick(r)?.plays ?? [])), r.trump);
    return { type: 'play', seat, card };
  }

  // ---------- connections ----------
  join(deviceId: string, rawName: string, now: number):
    | { ok: true; playerId: string }
    | { ok: false; reason: 'in_progress' | 'full' } {
    this.s.lastActivity = now;
    const name = cleanName(rawName) || 'Player';
    const existing = this.s.members.find((m) => m.deviceId === deviceId && !m.isBot);
    if (existing) {
      existing.connected = true;
      existing.offlineSince = null;
      if (this.s.stage === 'lobby') existing.name = name;
      if (existing.autoplay) existing.autoplay = false; // take back over
      if (this.s.pause?.playerId === existing.id) this.resume(now);
      if (!this.member(this.s.hostId)) this.s.hostId = existing.id;
      return { ok: true, playerId: existing.id };
    }
    if (this.s.stage === 'game') return { ok: false, reason: 'in_progress' };
    if (this.s.members.length >= MAX_PLAYERS) return { ok: false, reason: 'full' };
    const m: Member = {
      id: randomId(this.rand),
      deviceId,
      name,
      isBot: false,
      connected: true,
      autoplay: false,
      offlineSince: null,
      lastReaction: 0,
    };
    this.s.members.push(m);
    if (!this.member(this.s.hostId) || this.member(this.s.hostId)?.isBot) this.s.hostId = m.id;
    return { ok: true, playerId: m.id };
  }

  disconnect(playerId: string, now: number) {
    const m = this.member(playerId);
    if (!m) return;
    m.connected = false;
    m.offlineSince = now;
    this.s.lastActivity = now;
  }

  private resume(now: number) {
    this.s.pause = null;
    if (this.s.turnRemaining !== null) {
      this.s.turnDeadline = now + this.s.turnRemaining;
      this.s.turnRemaining = null;
    }
    this.s.settleUntil = Math.max(this.s.settleUntil, now + 600);
  }

  private transferHost() {
    const next = this.s.members.find((m) => !m.isBot && m.connected && m.id !== this.s.hostId);
    if (next) this.s.hostId = next.id;
  }

  // ---------- messages ----------
  /** Apply a client message, then advance timers so bots/timeouts get scheduled. */
  handle(playerId: string, msg: ClientMsg, now: number): Outcome {
    const out = this.handleMessage(playerId, msg, now);
    if (out.changed && !out.error) out.events.push(...this.tick(now));
    return out;
  }

  private handleMessage(playerId: string, msg: ClientMsg, now: number): Outcome {
    const me = this.member(playerId);
    if (!me) return this.err('not_member');
    this.s.lastActivity = now;
    const host = this.isHost(playerId);
    const s = this.s;

    switch (msg.type) {
      case 'setSettings': {
        if (!host) return this.err('host_only');
        // Chat can be switched at any time; everything else only in the lobby.
        const chatOnly = msg.chat !== undefined && Object.keys(msg).every((k) => k === 'type' || k === 'chat');
        if (s.stage !== 'lobby' && !chatOnly) return this.err('wrong_stage');
        if (msg.chat !== undefined) s.settings.chat = msg.chat;
        if (msg.startCards !== undefined) s.settings.startCards = Math.max(1, Math.min(17, Math.round(msg.startCards)));
        if (msg.tracker !== undefined) s.settings.tracker = msg.tracker;
        if (msg.turnTimer !== undefined) s.settings.turnTimer = msg.turnTimer;
        if (msg.scoring !== undefined) s.settings.scoring = msg.scoring;
        return this.ok();
      }
      case 'addBot': {
        if (!host) return this.err('host_only');
        if (s.stage !== 'lobby') return this.err('wrong_stage');
        if (s.members.length >= MAX_PLAYERS) return this.err('full');
        const used = new Set(s.members.map((m) => m.name));
        const pick = BOT_NAMES.find((n) => !used.has(`Bot ${n}`)) ?? `${s.members.length}`;
        s.members.push({
          id: 'bot-' + randomId(this.rand),
          deviceId: '',
          name: `Bot ${pick}`,
          isBot: true,
          connected: true,
          autoplay: false,
          offlineSince: null,
          lastReaction: 0,
        });
        return this.ok();
      }
      case 'removeMember': {
        if (!host) return this.err('host_only');
        if (s.stage !== 'lobby') return this.err('wrong_stage');
        if (msg.id === playerId) return this.err('cannot_remove_self');
        if (!this.member(msg.id)) return this.err('no_member');
        s.members = s.members.filter((m) => m.id !== msg.id);
        return this.ok([], { removed: [msg.id] });
      }
      case 'start': {
        if (!host) return this.err('host_only');
        if (s.stage !== 'lobby') return this.err('wrong_stage');
        if (s.members.length < MIN_PLAYERS) return this.err('need_players');
        const n = s.members.length;
        const seed = Math.floor(this.rand() * 2 ** 32);
        const { state, events } = createGame(n, s.settings, seed, Math.floor(this.rand() * n));
        s.game = state;
        s.stage = 'game';
        s.gameStartedAt = now;
        s.ready = [];
        s.pause = null;
        s.endedEarly = false;
        s.autoDealAt = null;
        this.resetTurnClock();
        s.settleUntil = now + SETTLE_MS;
        return this.ok(events);
      }
      case 'bid':
      case 'play': {
        if (!this.gameActive()) return this.err('wrong_phase');
        if (s.pause) return this.err('paused');
        const seat = this.seatOf(playerId);
        const action: Action =
          msg.type === 'bid' ? { type: 'bid', seat, bid: msg.bid } : { type: 'play', seat, card: msg.card };
        const res = this.applyGame(action, now);
        if (typeof res === 'string') return this.err(res);
        return this.ok(res);
      }
      case 'ready': {
        if (s.game?.phase !== 'roundEnd') return this.err('wrong_phase');
        if (!s.ready.includes(playerId)) s.ready.push(playerId);
        s.autoDealAt = Math.min(s.autoDealAt ?? Infinity, now + READY_DEAL_MS);
        const waiting = s.members.filter((m) => !m.isBot && !m.autoplay && m.connected && !s.ready.includes(m.id));
        if (waiting.length === 0) {
          const res = this.applyGame({ type: 'nextRound' }, now);
          if (typeof res === 'string') return this.err(res);
          return this.ok(res);
        }
        return this.ok();
      }
      case 'voteWait': {
        const p = s.pause;
        if (!p) return this.err('not_paused');
        if (p.playerId === playerId) return this.err('cannot_vote');
        if (!p.expired && p.holdUntil - now > VOTE_WINDOW_MS) return this.err('vote_closed');
        if (!p.votes.includes(playerId)) p.votes.push(playerId);
        const eligible = s.members.filter((m) => !m.isBot && m.connected && m.id !== p.playerId).length;
        if (p.votes.length * 2 > eligible) {
          p.holdUntil = (p.expired ? now : Math.max(now, p.holdUntil)) + HOLD_MS;
          p.expired = false;
          p.votes = [];
          p.extensions = (p.extensions ?? 0) + 1; // `?? 0`: pauses persisted before this field existed
        }
        return this.ok();
      }
      case 'autoplay': {
        if (!host) return this.err('host_only');
        if (s.stage !== 'game') return this.err('wrong_stage');
        const target = this.member(msg.id);
        if (!target || target.isBot) return this.err('no_member');
        target.autoplay = msg.on;
        if (msg.on) {
          if (s.pause?.playerId === target.id) this.resume(now);
          if (s.game?.phase === 'roundEnd' && !s.ready.includes(target.id)) s.ready.push(target.id);
        }
        return this.ok();
      }
      case 'endGame': {
        if (!host) return this.err('host_only');
        if (s.stage !== 'game' || !s.game || s.game.phase === 'gameEnd') return this.err('wrong_stage');
        s.game.phase = 'gameEnd';
        s.endedEarly = true;
        s.pause = null;
        s.autoDealAt = null;
        this.resetTurnClock();
        return this.ok([{ type: 'gameOver' }]);
      }
      case 'react': {
        if (now - me.lastReaction < REACTION_COOLDOWN_MS) return { events: [], changed: false, error: 'slow_down' };
        me.lastReaction = now;
        return { events: [], changed: false, reaction: { from: playerId, emoji: msg.emoji } };
      }
      case 'chat': {
        if (s.settings.chat === false) return { events: [], changed: false, error: 'chat_off' };
        if (s.muted?.includes(playerId)) return { events: [], changed: false, error: 'muted' };
        const text = cleanChat(msg.text);
        if (!text) return { events: [], changed: false, error: 'bad_message' };
        if (LINK.test(text)) return { events: [], changed: false, error: 'no_links' };
        const tokens = Math.min(CHAT_BURST, (me.chatTokens ?? CHAT_BURST) + (now - (me.chatAt ?? 0)) / CHAT_RATE_MS);
        if (tokens < 1) return { events: [], changed: false, error: 'slow_down' };
        me.chatTokens = tokens - 1;
        me.chatAt = now;
        const g = s.stage === 'game' ? s.game : null;
        // trick = tricks completed so far, null while bidding.
        const trick = g && g.phase !== 'bidding' ? g.round.tricks.filter((t) => t.winner !== null).length : null;
        return { events: [], changed: false, chat: { from: playerId, text, at: now, round: g ? g.round.index : null, trick } };
      }
      case 'mute': {
        if (!host) return this.err('host_only');
        if (msg.id === playerId || !this.member(msg.id)) return this.err('no_member');
        const muted = (s.muted ?? []).filter((id) => id !== msg.id);
        s.muted = msg.on ? [...muted, msg.id] : muted;
        return this.ok();
      }
      case 'rematch': {
        if (s.stage !== 'game' || s.game?.phase !== 'gameEnd') return this.err('wrong_stage');
        s.stage = 'lobby';
        s.game = null;
        s.endedEarly = false;
        s.ready = [];
        s.pause = null;
        // Players who left during the game drop out of the new lobby.
        s.members = s.members.filter((m) => m.isBot || m.connected);
        for (const m of s.members) m.autoplay = false;
        if (!this.member(s.hostId)) this.transferHost();
        return this.ok();
      }
      case 'leave': {
        if (s.stage === 'lobby') {
          s.members = s.members.filter((m) => m.id !== playerId);
          if (host) {
            const next = s.members.find((m) => !m.isBot && m.connected);
            s.hostId = next?.id ?? '';
          }
          return this.ok([], { removed: [playerId] });
        }
        me.connected = false;
        me.offlineSince = now - GRACE_MS;
        if (host) this.transferHost();
        return this.ok([], { removed: [playerId] });
      }
    }
  }

  // ---------- time ----------
  /** Advance timers. Returns game events produced by automatic actions. */
  tick(now: number): GameEvent[] {
    const s = this.s;
    const events: GameEvent[] = [];
    for (let guard = 0; guard < 200; guard++) {
      // Host who has been gone for a full hold loses host rights.
      const h = this.member(s.hostId);
      if (!h || (!h.connected && h.offlineSince !== null && now - h.offlineSince >= HOLD_MS)) {
        const before = s.hostId;
        this.transferHost();
        if (s.hostId !== before) continue;
      }

      if (s.stage === 'game' && s.game?.phase === 'roundEnd') {
        if (s.autoDealAt !== null && s.autoDealAt <= now) {
          const res = this.applyGame({ type: 'nextRound' }, now);
          if (typeof res !== 'string') events.push(...res);
          continue;
        }
        break;
      }

      if (!this.gameActive()) break;

      // Start a pause for someone who has been offline past the grace period.
      if (!s.pause) {
        const gone = s.members.find(
          (m) => !m.isBot && !m.autoplay && !m.connected && m.offlineSince !== null && now - m.offlineSince >= GRACE_MS,
        );
        if (gone) {
          s.pause = { playerId: gone.id, holdUntil: now + HOLD_MS, votes: [], extensions: 0, expired: false };
          if (s.turnDeadline !== null) s.turnRemaining = Math.max(0, s.turnDeadline - now);
          s.turnDeadline = null;
          s.botDue = null;
          continue;
        }
      }

      if (s.pause) {
        if (!s.pause.expired && s.pause.holdUntil <= now) {
          s.pause.expired = true;
          s.pause.votes = [];
          if (s.pause.playerId === s.hostId) this.transferHost();
          continue;
        }
        break;
      }

      const g = s.game!;
      const seat = g.round.turn;
      const actor = s.members[seat];
      if (actor.isBot || actor.autoplay) {
        s.turnDeadline = null; // stale if a human handed over to autoplay mid-turn
        if (s.botDue === null) {
          s.botDue = Math.max(now, s.settleUntil) + 700 + Math.floor(this.rand() * 700);
          break;
        }
        if (s.botDue <= now) {
          const res = this.applyGame(this.autoAction(seat, actor.isBot), now);
          if (typeof res !== 'string') events.push(...res);
          continue;
        }
        break;
      }
      s.botDue = null; // stale if an autoplay seat was taken back

      if (s.settings.turnTimer > 0) {
        if (s.turnDeadline === null) {
          s.turnDeadline = Math.max(now, s.settleUntil) + (s.turnRemaining ?? s.settings.turnTimer * 1000);
          s.turnRemaining = null;
          break;
        }
        if (s.turnDeadline <= now) {
          const res = this.applyGame(this.autoAction(seat, false), now);
          if (typeof res !== 'string') events.push(...res);
          continue;
        }
      }
      break;
    }
    return events;
  }

  /** Next time `tick` has something to do, or null. */
  nextWake(): number | null {
    const s = this.s;
    const times: number[] = [];
    const h = this.member(s.hostId);
    // Only worth waking for if someone could take over; otherwise this time stays in the past and
    // the alarm would fire over and over. A player connecting later triggers the transfer anyway.
    const heir = s.members.some((m) => !m.isBot && m.connected && m.id !== s.hostId);
    if (h && !h.connected && h.offlineSince !== null && heir) times.push(h.offlineSince + HOLD_MS);
    if (s.stage === 'game' && s.game?.phase === 'roundEnd' && s.autoDealAt !== null) times.push(s.autoDealAt);
    if (this.gameActive()) {
      if (s.pause) {
        if (!s.pause.expired) times.push(s.pause.holdUntil);
      } else {
        for (const m of s.members) {
          if (!m.isBot && !m.autoplay && !m.connected && m.offlineSince !== null) times.push(m.offlineSince + GRACE_MS);
        }
        if (s.botDue !== null) times.push(s.botDue);
        if (s.turnDeadline !== null) times.push(s.turnDeadline);
      }
    }
    return times.length ? Math.min(...times) : null;
  }

  // ---------- views ----------
  roomView(playerId: string | null, now: number): RoomView {
    const s = this.s;
    return {
      code: s.code,
      you: playerId,
      hostId: s.hostId,
      members: s.members.map((m) => ({
        id: m.id,
        name: m.name,
        isBot: m.isBot,
        isHost: m.id === s.hostId,
        connected: m.connected,
        autoplay: m.autoplay,
      })),
      settings: { ...s.settings },
      stage: s.stage,
      ready: [...s.ready],
      pause: s.pause ? { ...s.pause, votes: [...s.pause.votes], extensions: s.pause.extensions ?? 0 } : null,
      turnDeadline: s.pause ? null : s.turnDeadline,
      autoDealAt: s.game?.phase === 'roundEnd' ? s.autoDealAt : null,
      endedEarly: s.endedEarly,
      muted: [...(s.muted ?? [])],
      serverNow: now,
    };
  }

  gameView(playerId: string | null): GameView | null {
    if (!this.s.game) return null;
    const seat = playerId ? this.seatOf(playerId) : -1;
    return gameViewFor(this.s.game, seat >= 0 ? seat : null);
  }
}

