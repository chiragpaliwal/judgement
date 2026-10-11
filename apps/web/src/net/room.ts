import { create } from 'zustand';
import PartySocket from 'partysocket';
import {
  isOut,
  outReason,
  type ClientMsg,
  type GameEvent,
  type GameView,
  type Reaction,
  type RoomView,
  type ServerMsg,
  type Trick,
} from '@judgement/engine';
import { deviceId, getName } from '../lib/identity';
import { haptic, sfx } from '../lib/fx';
import { FLUSH_BACKLOG, nextGap } from './pace';
import { chatArrived, chatHistory, chatServerError, reactionEntry, resetChat } from './chat';

export type Issue = 'no_room' | 'in_progress' | 'full' | 'replaced' | 'removed' | 'left' | null;

export interface HeldTrick {
  trick: Trick;
  index: number;
  until: number;
}

export interface Toast {
  id: number;
  title: string;
  sub: string;
}

export interface FloatingReaction {
  id: number;
  from: string;
  emoji: Reaction;
}

interface RoomStore {
  code: string | null;
  status: 'idle' | 'connecting' | 'open' | 'reconnecting';
  issue: Issue;
  room: RoomView | null;
  game: GameView | null;
  /** serverNow - Date.now() at last state. */
  clockOffset: number;
  /** Increments on each deal; used to key the deal animation. */
  dealKey: number;
  held: HeldTrick | null;
  toast: Toast | null;
  reactions: FloatingReaction[];
  lastError: string | null;
  connect: (code: string) => void;
  disconnect: () => void;
  send: (msg: ClientMsg) => void;
  clearHeld: () => void;
}

let socket: PartySocket | null = null;
let heart: Heartbeat | null = null;
let heldTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
/** `seq` of the last state received, sent on reconnect so the server can log how much was missed. */
let lastSeq = 0;
/** Connection attempts on this page, and what dropped the last open socket; both go to the server's logs. */
let attempt = 0;
let dropReason: string | null = null;

/** Hold 400ms, winner ring pulse, then cards fold into the winner (DESIGN_SPEC §7). */
export const TRICK_HOLD_MS = 1000;

export const useRoom = create<RoomStore>((set, get) => ({
  code: null,
  status: 'idle',
  issue: null,
  room: null,
  game: null,
  clockOffset: 0,
  dealKey: 0,
  held: null,
  toast: null,
  reactions: [],
  lastError: null,

  connect(code) {
    if (socket && get().code === code) return;
    socket?.close();
    heart?.stop();
    resetQueue();
    resetChat(code);
    set({ code, status: 'connecting', issue: null, room: null, game: null, held: null, toast: null });
    attempt = 0;
    dropReason = null;
    const ws = new PartySocket({
      host: location.host,
      party: 'room',
      room: code,
      query: () => {
        attempt++;
        return { deviceId: deviceId(), name: getName(), reason: dropReason ?? 'initial', attempt: String(attempt), since: String(lastSeq) };
      },
      maxRetries: Infinity,
      // partysocket's defaults wait 3s before the second try and back off to 10s, and a socket must stay
      // up 5s before that resets. On a phone that drops now and then, that showed "Reconnecting…" for
      // seconds at a time and let the room pause the table. Retry quickly instead.
      minReconnectionDelay: 250,
      maxReconnectionDelay: 3_000,
      reconnectionDelayGrowFactor: 1.5,
      minUptime: 2_000,
      // A handshake to a far-off data center over weak Wi-Fi can take longer than the default 4s.
      connectionTimeout: 8_000,
    });
    socket = ws;
    heart = heartbeat(ws);
    ws.addEventListener('open', () => {
      if (socket !== ws) return;
      dropReason = null;
      set({ status: 'open' });
    });
    ws.addEventListener('close', (e: CloseEvent) => {
      if (socket !== ws) return;
      // Keep the first cause until a socket opens again; failed retries close too.
      dropReason ??= `close-${typeof e.code === 'number' ? e.code : '?'}${typeof e.reason === 'string' && e.reason ? `:${e.reason}` : ''}`;
      if (e.code >= 4000 && e.code < 4100) {
        ws.close();
        socket = null;
        heart?.stop();
        heart = null;
        set({ status: 'idle' });
        return;
      }
      set({ status: 'reconnecting' });
    });
    ws.addEventListener('message', (e: MessageEvent) => {
      if (socket !== ws || e.data === PONG) return;
      let msg: ServerMsg;
      try {
        msg = JSON.parse(e.data as string);
      } catch {
        return;
      }
      onMessage(msg);
    });
  },

  disconnect() {
    socket?.close();
    socket = null;
    heart?.stop();
    heart = null;
    resetQueue();
    if (heldTimer) clearTimeout(heldTimer);
    set({ code: null, status: 'idle', room: null, game: null, held: null, issue: null });
  },

  send(msg) {
    socket?.send(JSON.stringify(msg));
    heart?.nudge();
    // A move should get a state back right away; if the socket is secretly dead, find out now.
    if (msg.type === 'bid' || msg.type === 'play') heart?.probe();
  },

  clearHeld() {
    if (heldTimer) clearTimeout(heldTimer);
    set({ held: null });
  },
}));

const PING = 'ping';
const PONG = 'pong';
/** Beat while the table is on screen; short enough that a held-back update is never far off. */
const PING_ACTIVE_MS = 1_000;
/** Beat in the background, where browsers throttle timers anyway. */
const PING_IDLE_MS = 10_000;
/**
 * A socket is declared dead after this many pings and PONG_TIMEOUT_MS with nothing back. Phone radios
 * can hold incoming frames for several seconds; reconnecting over that costs more than it saves.
 */
const PONG_TIMEOUT_MS = 8_000;
const MAX_MISSES = 3;
const NUDGE_MS = 250;

interface Heartbeat {
  probe: () => void;
  nudge: () => void;
  stop: () => void;
}

/**
 * Keeps the socket honest in both directions.
 *
 * - Phones in Wi-Fi power save (seen on iPhone Safari) can hold incoming frames until the phone
 *   itself transmits, so server updates arrive late and in bursts, or not at all. Every ping is
 *   such a transmission, so ping often while the table is visible, and send one shortly after
 *   each of our own messages to pull the reply in.
 * - A socket can also go half-open: it reads OPEN but nothing arrives. If several pings go
 *   unanswered, force a reconnect; the server then resends the full state.
 * - The beat must not depend on incoming traffic: the server only hears from us through these
 *   pings and drops sockets that go quiet (STALE_MS in the server's room.ts).
 */
function heartbeat(ws: PartySocket): Heartbeat {
  // Pings never wait for pongs: on a held-back link the pong is held too, and only the next
  // ping releases it.
  let waitingSince: number | null = null;
  let unanswered = 0;
  let checkTimer: ReturnType<typeof setTimeout> | null = null;
  let lastPing = 0;
  let nudgeTimer: ReturnType<typeof setTimeout> | null = null;

  const onRx = () => {
    waitingSince = null;
    unanswered = 0;
    if (checkTimer) clearTimeout(checkTimer);
    checkTimer = null;
  };
  const ping = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(PING);
    lastPing = Date.now();
    waitingSince ??= lastPing;
    unanswered++;
    checkTimer ??= setTimeout(check, PONG_TIMEOUT_MS);
  };
  const check = () => {
    checkTimer = null;
    if (waitingSince === null || ws.readyState !== WebSocket.OPEN) return;
    if (unanswered >= MAX_MISSES) {
      onRx();
      dropReason ??= 'heartbeat';
      ws.reconnect();
    } else ping();
  };
  const onOpen = () => {
    onRx();
    // The join snapshot may be held back like any other update; pull it in right away.
    ping();
  };
  const beat = () => {
    const active = document.visibilityState === 'visible' && useRoom.getState().room !== null;
    if (Date.now() - lastPing >= (active ? PING_ACTIVE_MS : PING_IDLE_MS) - 50) ping();
  };
  const nudge = () => {
    nudgeTimer ??= setTimeout(() => {
      nudgeTimer = null;
      ping();
    }, NUDGE_MS);
  };
  const onVisible = () => {
    if (document.visibilityState === 'visible') ping();
  };

  ws.addEventListener('message', onRx);
  ws.addEventListener('open', onOpen);
  const interval = setInterval(beat, PING_ACTIVE_MS);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', ping);
  return {
    probe: ping,
    nudge,
    stop() {
      clearInterval(interval);
      if (nudgeTimer) clearTimeout(nudgeTimer);
      if (checkTimer) clearTimeout(checkTimer);
      ws.removeEventListener('message', onRx);
      ws.removeEventListener('open', onOpen);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', ping);
    },
  };
}

function showToast(title: string, sub: string) {
  if (toastTimer) clearTimeout(toastTimer);
  useRoom.setState({ toast: { id: ++seq, title, sub } });
  toastTimer = setTimeout(() => useRoom.setState({ toast: null }), 3200);
}

function onMessage(msg: ServerMsg) {
  const set = useRoom.setState;
  switch (msg.type) {
    case 'no_room':
      set({ issue: 'no_room' });
      return;
    case 'locked':
      set({ issue: msg.reason });
      return;
    case 'replaced':
      set({ issue: 'replaced' });
      return;
    case 'error':
      if (msg.code === 'removed' || msg.code === 'left') set({ issue: msg.code });
      else set({ lastError: msg.code });
      chatServerError(msg.code);
      return;
    case 'reaction': {
      const r = { id: ++seq, from: msg.from, emoji: msg.emoji };
      set((s) => ({ reactions: [...s.reactions, r] }));
      setTimeout(() => set((s) => ({ reactions: s.reactions.filter((x) => x.id !== r.id) })), 2400);
      const { game, room } = useRoom.getState();
      const inGame = room?.stage === 'game' && game;
      const trick = inGame && game.phase !== 'bidding' ? game.round.tricksDone : null;
      const who = room?.members.find((m) => m.id === msg.from)?.name ?? 'Someone';
      chatArrived(reactionEntry(msg.from, who, msg.emoji, room?.gameId ?? null, inGame ? game.round.index : null, trick), room?.you ?? null);
      return;
    }
    case 'chat':
      chatArrived(msg.msg, useRoom.getState().room?.you ?? null);
      return;
    case 'chatHistory':
      chatHistory(msg.msgs, useRoom.getState().room?.you ?? null);
      return;
    case 'state':
      lastSeq = msg.seq ?? 0;
      enqueue({ room: msg.room, game: msg.game, events: msg.events, at: Date.now() });
  }
}

interface Queued {
  room: RoomView;
  game: GameView | null;
  events: GameEvent[];
  /** Local arrival time; the clock offset is measured here, not when the state is shown. */
  at: number;
}

let queue: Queued[] = [];
let pumpTimer: ReturnType<typeof setTimeout> | null = null;
let busyUntil = 0;

function resetQueue() {
  queue = [];
  if (pumpTimer) clearTimeout(pumpTimer);
  pumpTimer = null;
  busyUntil = 0;
  lastSeq = 0;
}

/**
 * Show server states one at a time, giving each move time to animate. A slow link can deliver
 * several states at once; applied together they render as one jump with no animation.
 *
 * The first state on a reconnected socket is a full snapshot. It goes to the back of the queue like
 * any other: whatever is already queued is older and still worth animating, and if nothing was missed
 * while the socket was down the snapshot is simply the next state. If states were missed, the table
 * jumps, but only once the move on screen has finished.
 */
function enqueue(item: Queued) {
  queue.push(item);
  if (!pumpTimer) pump();
}

function pump() {
  pumpTimer = null;
  const flush = queue.length > FLUSH_BACKLOG;
  while (queue.length) {
    const wait = busyUntil - Date.now();
    if (!flush && wait > 0) {
      pumpTimer = setTimeout(pump, wait);
      return;
    }
    const item = queue.shift()!;
    applyState(item);
    const oldest = queue[0] ? Date.now() - queue[0].at : 0;
    busyUntil = flush ? 0 : Date.now() + nextGap(item.events, queue.length, oldest, TRICK_HOLD_MS);
  }
}

function applyState({ room, game, events, at }: Queued) {
  const prev = useRoom.getState();
  const prevGame = prev.game;
  const me = game?.me ?? null;
  const patch: Partial<RoomStore> = { room, game, clockOffset: room.serverNow - at, issue: null };

  // A new card on the table ends any held trick immediately.
  if (events.some((e) => e.type === 'play' || e.type === 'dealt') && prev.held) patch.held = null;

  for (const e of events) {
    if (e.type === 'dealt') {
      patch.dealKey = prev.dealKey + 1;
      sfx.deal(e.cards);
      setTimeout(() => haptic('light'), 900);
    }
    if (e.type === 'play') sfx.card();
    if (e.type === 'bid') sfx.bid();
    if (e.type === 'trickWon' && game) {
      const local = e.trick - game.round.firstTrickIndex;
      const trick = game.round.tricks[local];
      if (trick) {
        if (heldTimer) clearTimeout(heldTimer);
        patch.held = { trick, index: e.trick, until: Date.now() + TRICK_HOLD_MS };
        heldTimer = setTimeout(() => {
          useRoom.setState({ held: null });
          sfx.sweep();
        }, TRICK_HOLD_MS);
      }
    }
    if (e.type === 'roundScored' && me !== null) {
      setTimeout(() => {
        if (e.points[me] > 0) {
          sfx.made();
          haptic('made');
        } else {
          sfx.missed();
          haptic('missed');
        }
      }, TRICK_HOLD_MS + 300);
    }
    if (e.type === 'gameOver') setTimeout(() => sfx.win(), TRICK_HOLD_MS + 500);
  }

  // Busts: misses show the moment they are certain.
  if (game && prevGame && game.round.index === prevGame.round.index && game.phase !== 'bidding') {
    for (let i = 0; i < game.n; i++) {
      if (!isOut(game.round, i) || isOut(prevGame.round, i)) continue;
      const why = outReason(game.round, i);
      if (!why) continue;
      const you = i === me;
      const name = you ? 'You' : (room.members[i]?.name ?? 'Someone');
      const sub =
        why.kind === 'over'
          ? `Took ${game.round.won[i]} on a bid of ${game.round.bids[i]}.`
          : `Needed ${why.needed} with ${why.left} trick${why.left === 1 ? '' : 's'} left.`;
      showToast(`${name} ${you ? 'are' : 'is'} out.`, sub);
      if (you) {
        sfx.bust();
        haptic('medium');
      }
    }
  }

  // Your turn chime.
  if (game && me !== null && (game.phase === 'bidding' || game.phase === 'playing')) {
    const myTurnNow = game.round.turn === me && !room.pause;
    const wasMyTurn =
      prevGame && prevGame.round.turn === me && (prevGame.phase === 'bidding' || prevGame.phase === 'playing') && prevGame.round.index === game.round.index && prevGame.phase === game.phase;
    if (myTurnNow && !wasMyTurn) {
      setTimeout(() => {
        sfx.turn();
        haptic('turn');
      }, events.some((e) => e.type === 'trickWon') ? TRICK_HOLD_MS : events.some((e) => e.type === 'dealt') ? 900 : 150);
    }
  }

  useRoom.setState(patch);
}

/** Server time now, corrected for clock skew. */
export const serverNow = () => Date.now() + useRoom.getState().clockOffset;
