// Table chat (DESIGN_SPEC §13). Separate from the room store: chat messages skip the state queue.
import { create } from 'zustand';
import { CHAT_HISTORY, type ChatMsg, type Reaction } from '@judgement/engine';
import { load, save } from '../lib/storage';

/** A chat message, or a quick reaction shown in the log as a large emoji. */
export type ChatEntry = ChatMsg & { reaction?: Reaction };

/** Seat marker and hand-header line both last this long. */
export const SPEAK_MS = 6_000;

interface ChatStore {
  log: ChatEntry[];
  unread: number;
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

export const useChat = create<ChatStore>((set, get) => ({
  log: [],
  unread: 0,
  sheet: null,
  speaking: {},
  flash: null,
  draft: '',
  onTable: load('jd.chatOnTable') !== '0',
  muted: loadList('jd.chatMuted'),
  open: (sheet) => set({ sheet, unread: 0 }),
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

export function resetChat() {
  if (flashTimer) clearTimeout(flashTimer);
  useChat.setState({ log: [], unread: 0, sheet: null, speaking: {}, flash: null, draft: '' });
}

/** Host turned chat off: drop everything on screen, keep the log for if it comes back. */
export function chatDisabled() {
  if (flashTimer) clearTimeout(flashTimer);
  useChat.setState({ sheet: null, speaking: {}, flash: null, unread: 0 });
}

export function chatHistory(msgs: ChatMsg[]) {
  // A reconnect replays history: keep local reactions, take the server's messages, no unread or markers.
  useChat.setState((s) => ({
    log: [...msgs, ...s.log.filter((e) => e.reaction && !msgs.some((m) => m.at > e.at))].sort((a, b) => a.at - b.at).slice(-CHAT_HISTORY),
  }));
}

/** A live message or reaction. `me` is the local member id. */
export function chatArrived(entry: ChatEntry, me: string | null) {
  const s = useChat.getState();
  if (s.log.some((e) => !e.reaction && !entry.reaction && e.id === entry.id)) return;
  const mine = entry.from === me;
  const hidden = !mine && s.muted.includes(entry.from);
  const patch: Partial<ChatStore> = { log: [...s.log, entry].slice(-CHAT_HISTORY) };
  if (!hidden && !entry.reaction) {
    if (!mine && s.sheet === null) patch.unread = s.unread + 1;
    if (s.onTable) {
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
  }
  useChat.setState(patch);
}

export const reactionEntry = (from: string, emoji: Reaction, round: number | null, trick: number | null): ChatEntry => ({
  id: --localId,
  from,
  text: emoji,
  reaction: emoji,
  at: Date.now(),
  round,
  trick,
});
