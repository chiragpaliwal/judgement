// Table chat (DESIGN_SPEC §13). Separate from the room store: chat messages skip the state queue.
import { create } from 'zustand';
import { CHAT_BURST, CHAT_HISTORY, CHAT_LINK, CHAT_RATE_MS, type ChatMsg, type Reaction } from '@judgement/engine';
import { load, save } from '../lib/storage';

/** A chat message, or a quick reaction shown in the log as a large emoji. */
export type ChatEntry = ChatMsg & { reaction?: Reaction };

/** Seat marker and hand-header line both last this long. */
export const SPEAK_MS = 6_000;
const NOTICE_MS = 3_000;

interface ChatStore {
  /** Room the log belongs to; the read marker is stored per room. */
  code: string | null;
  log: ChatEntry[];
  unread: number;
  /** Highest message id the player has seen in the log or composer. Null until known. */
  readUpTo: number | null;
  sheet: 'composer' | 'log' | null;
  /** Member id → id of the message that lit their speech marker. */
  speaking: Record<string, number>;
  /** Newest message from someone else, shown in place of the hand header for a few seconds. */
  flash: ChatEntry | null;
  draft: string;
  /** "Show chat on the table": off keeps only the unread count. */
  onTable: boolean;
  /** Members muted on this device. */
  muted: string[];
  /** Why the last send did not go out; shown above the field for a few seconds. */
  notice: string | null;
  open: (sheet: 'composer' | 'log') => void;
  close: () => void;
  setDraft: (text: string) => void;
  setOnTable: (on: boolean) => void;
  toggleMute: (id: string) => void;
}

const loadList = (key: string): string[] => {
  try {
    const v = JSON.parse(load(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
};

const PICTO = /\p{Extended_Pictographic}/gu;
const ONLY_EMOJI = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|[\u200d\ufe0f\s])+$/u;
/** A message made only of a few emoji (the 🔥 chip, say), which the log shows large with no bubble. */
export const isEmojiOnly = (text: string) => ONLY_EMOJI.test(text) && (text.match(PICTO)?.length ?? 0) <= 5;

const readKey = (code: string | null) => `jd.chatRead.${code}`;
const maxId = (log: ChatEntry[]) => log.reduce((m, e) => (e.reaction ? m : Math.max(m, e.id)), 0);
/** Messages from others newer than the read marker, not counting people muted on this device. */
const unreadOf = (log: ChatEntry[], readUpTo: number | null, muted: string[], me: string | null) =>
  log.filter((e) => !e.reaction && e.from !== me && !muted.includes(e.from) && e.id > (readUpTo ?? 0)).length;

export const useChat = create<ChatStore>((set, get) => ({
  code: null,
  log: [],
  unread: 0,
  readUpTo: null,
  sheet: null,
  speaking: {},
  flash: null,
  draft: '',
  onTable: load('jd.chatOnTable') !== '0',
  muted: loadList('jd.chatMuted'),
  notice: null,
  open(sheet) {
    const { log, code } = get();
    const readUpTo = Math.max(get().readUpTo ?? 0, maxId(log));
    save(readKey(code), String(readUpTo));
    set({ sheet, unread: 0, readUpTo, notice: null });
  },
  close: () => set({ sheet: null }),
  setDraft: (draft) => set({ draft }),
  setOnTable(onTable) {
    save('jd.chatOnTable', onTable ? '1' : '0');
    set(onTable ? { onTable } : { onTable, flash: null, speaking: {} });
  },
  toggleMute(id) {
    const m = get().muted;
    const muted = m.includes(id) ? m.filter((x) => x !== id) : [...m, id];
    save('jd.chatMuted', JSON.stringify(muted));
    set({ muted });
  },
}));

let localId = 0;
let flashTimer: ReturnType<typeof setTimeout> | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let tokens = CHAT_BURST;
let tokenAt = 0;

export function resetChat(code: string | null = null) {
  if (flashTimer) clearTimeout(flashTimer);
  const saved = load(readKey(code));
  useChat.setState({
    code,
    log: [],
    unread: 0,
    readUpTo: saved === null ? null : Number(saved) || 0,
    sheet: null,
    speaking: {},
    flash: null,
    draft: '',
    notice: null,
  });
}

/** Tell the player why a message did not go out. */
export function chatNotice(text: string) {
  if (noticeTimer) clearTimeout(noticeTimer);
  useChat.setState({ notice: text });
  noticeTimer = setTimeout(() => useChat.setState({ notice: null }), NOTICE_MS);
}

const SERVER_NOTICES: Record<string, string> = {
  slow_down: 'Slow down a little',
  no_links: 'Links aren’t allowed in chat',
  muted: 'The host muted you',
  chat_off: 'Chat is turned off',
};
/** Server refusal of a chat message; other error codes are not shown. */
export function chatServerError(code: string) {
  if (SERVER_NOTICES[code]) chatNotice(SERVER_NOTICES[code]);
}

/**
 * Checks a message before it is sent, mirroring the server's rules, so a refused message stays in
 * the field instead of vanishing. Returns true if it may go out now.
 */
export function mayChat(text: string, now = Date.now()): boolean {
  if (CHAT_LINK.test(text)) {
    chatNotice(SERVER_NOTICES.no_links);
    return false;
  }
  tokens = Math.min(CHAT_BURST, tokens + (now - tokenAt) / CHAT_RATE_MS);
  tokenAt = now;
  if (tokens < 1) {
    chatNotice(SERVER_NOTICES.slow_down);
    return false;
  }
  tokens -= 1;
  return true;
}

/** Host turned chat off: drop everything on screen, keep the log for if it comes back. */
export function chatDisabled() {
  if (flashTimer) clearTimeout(flashTimer);
  useChat.setState({ sheet: null, speaking: {}, flash: null, unread: 0, notice: null });
}

/**
 * The server's history, sent on every (re)connect. Messages newer than the read marker count as
 * unread, so ones that arrived while the page was away are not lost. A first visit has no marker:
 * what was said before you joined is not unread.
 */
export function chatHistory(msgs: ChatMsg[], me: string | null) {
  const s = useChat.getState();
  const log = [...msgs, ...s.log.filter((e) => e.reaction && !msgs.some((m) => m.at > e.at))].sort((a, b) => a.at - b.at).slice(-CHAT_HISTORY);
  const top = maxId(log);
  const readUpTo = s.sheet !== null || s.readUpTo === null ? top : s.readUpTo;
  if (readUpTo !== s.readUpTo) save(readKey(s.code), String(readUpTo));
  useChat.setState({ log, readUpTo, unread: unreadOf(log, readUpTo, s.muted, me) });
}

/** A live message or reaction. `me` is the local member id. */
export function chatArrived(entry: ChatEntry, me: string | null) {
  const s = useChat.getState();
  if (s.log.some((e) => !e.reaction && !entry.reaction && e.id === entry.id)) return;
  const mine = entry.from === me;
  const hidden = !mine && s.muted.includes(entry.from);
  const log = [...s.log, entry].slice(-CHAT_HISTORY);
  const patch: Partial<ChatStore> = { log };
  if (!entry.reaction) {
    if (s.sheet !== null || mine) {
      patch.readUpTo = Math.max(s.readUpTo ?? 0, entry.id);
      save(readKey(s.code), String(patch.readUpTo));
    } else if (!hidden) patch.unread = s.unread + 1;
  }
  if (!hidden && !entry.reaction && s.onTable) {
    patch.speaking = { ...s.speaking, [entry.from]: entry.id };
    setTimeout(() => {
      const cur = useChat.getState().speaking;
      if (cur[entry.from] !== entry.id) return;
      const { [entry.from]: _, ...rest } = cur;
      useChat.setState({ speaking: rest });
    }, SPEAK_MS);
    if (!mine) {
      patch.flash = entry;
      if (flashTimer) clearTimeout(flashTimer);
      flashTimer = setTimeout(() => useChat.setState({ flash: null }), SPEAK_MS);
    }
  }
  useChat.setState(patch);
}

export const reactionEntry = (from: string, name: string, emoji: Reaction, game: number | null, round: number | null, trick: number | null): ChatEntry => ({
  id: --localId,
  from,
  name,
  game,
  text: emoji,
  reaction: emoji,
  at: Date.now(),
  round,
  trick,
});
