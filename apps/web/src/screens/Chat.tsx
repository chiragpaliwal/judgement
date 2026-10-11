// Table chat (DESIGN_SPEC §13): button, composer, full log, draft chip and the hand-header line.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CHAT_MAX,
  cardLabel,
  openTrick,
  rankLabel,
  trickWinner,
  type GameView,
  type RoomView,
} from '@judgement/engine';
import { useRoom } from '../net/room';
import { useChat, type ChatEntry } from '../net/chat';
import { initialOf } from '../game/seats';
import { haptic } from '../lib/fx';
import { Icon, SuitIcon } from '../ui/icons';
import { Sheet } from './Sheet';

const STANDARD = ['Nice one', 'Unlucky', 'No way', '😂', '🔥', 'GG', 'Brb'];
const LONG_PRESS_MS = 500;

/** Host setting; absent on older rooms means on. */
export const useChatOn = () => useRoom((s) => s.room?.settings.chat !== false);

const nameOf = (room: RoomView, id: string) => (id === room.you ? 'You' : (room.members.find((m) => m.id === id)?.name ?? 'Someone'));

export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 10) return 'now';
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)}m`;
}

/** "Come on, Ira" for whoever is acting, "Nice K, Dev" for whoever is winning the trick. At most two. */
export function contextChips(room: RoomView, game: GameView | null): string[] {
  if (!game || room.stage !== 'game' || (game.phase !== 'bidding' && game.phase !== 'playing')) return [];
  const r = game.round;
  const chips: string[] = [];
  const turnId = room.members[r.turn]?.id;
  if (turnId && turnId !== room.you) chips.push(`Come on, ${nameOf(room, turnId)}`);
  const plays = game.phase === 'playing' ? (openTrick(r)?.plays ?? []) : [];
  if (plays.length >= 2) {
    const w = trickWinner(plays, r.trump);
    const card = plays.find((p) => p.seat === w)!.card;
    const id = room.members[w]?.id;
    if (id && id !== room.you) chips.push(`Nice ${rankLabel(card)}, ${nameOf(room, id)}`);
  }
  return chips.slice(0, 2);
}

/** Thin centred separators between log groups: round start, bids in, each trick's winner. */
function separators(prev: ChatEntry | null, cur: ChatEntry, room: RoomView, game: GameView | null): React.ReactNode[] {
  if (cur.round === null || !game) return [];
  const out: React.ReactNode[] = [];
  const r = game.round;
  const rec = cur.round === r.index ? { cards: r.cards, trump: r.trump, bids: r.bids } : game.history[cur.round];
  const newRound = !prev || prev.round !== cur.round;
  if (newRound && rec) {
    out.push(
      <>
        Round {cur.round + 1} · {rec.cards} {rec.cards === 1 ? 'card' : 'cards'} · trump <SuitIcon suit={rec.trump} dark />
      </>,
    );
  }
  const prevTrick = newRound ? null : prev!.trick;
  if (cur.trick !== null && prevTrick === null && rec) {
    const sum = rec.bids.reduce<number>((a, b) => a + (b ?? 0), 0);
    out.push(`Bids ${sum} into ${rec.cards}${sum > rec.cards ? ` · ${sum - rec.cards} short` : sum < rec.cards ? ` · ${rec.cards - sum} spare` : ''}`);
  }
  if (cur.trick !== null && cur.round === r.index) {
    for (let t = prevTrick ?? 0; t < cur.trick; t++) {
      const trick = r.tricks[t - r.firstTrickIndex];
      if (!trick || trick.winner === null) {
        out.push(`Trick ${t + 1}`);
        continue;
      }
      const card = trick.plays.find((p) => p.seat === trick.winner)!.card;
      const who = room.members[trick.winner]?.id;
      out.push(`Trick ${t + 1} · ${who ? (who === room.you ? 'You' : nameOf(room, who)) : '?'} took it with ${cardLabel(card)}`);
    }
  }
  return out;
}

export function ChatButton({ className = 'ib sq', style }: { className?: string; style?: React.CSSProperties }) {
  const unread = useChat((s) => s.unread);
  const open = useChat((s) => s.open);
  if (!useChatOn()) return null;
  return (
    <button className={`${className} chatbtn`} style={style} aria-label={unread ? `Chat, ${unread} unread` : 'Chat'} onClick={() => open('composer')}>
      <Icon.Chat />
      {unread > 0 && <span className="ub mono">{unread > 9 ? '9+' : unread}</span>}
    </button>
  );
}

function useSend() {
  const send = useRoom((s) => s.send);
  return (text: string) => {
    const t = text.trim().slice(0, CHAT_MAX);
    if (!t) return false;
    send({ type: 'chat', text: t });
    haptic('light');
    return true;
  };
}

function Field({ placeholder, disabled, onSent }: { placeholder: string; disabled: boolean; onSent?: () => void }) {
  const draft = useChat((s) => s.draft);
  const setDraft = useChat((s) => s.setDraft);
  const send = useSend();
  const submit = () => {
    if (!send(draft)) return;
    setDraft('');
    onSent?.();
  };
  return (
    <form
      className="cin"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        className="cfield"
        value={draft}
        maxLength={CHAT_MAX}
        placeholder={disabled ? 'The host muted you' : placeholder}
        disabled={disabled}
        enterKeyHint="send"
        aria-label="Message"
        onChange={(e) => setDraft(e.target.value)}
      />
      <button className={`csend${draft.trim() ? ' on' : ''}`} type="submit" aria-label="Send" disabled={disabled || !draft.trim()}>
        <Icon.Send />
      </button>
    </form>
  );
}

function Chips({ room, game, row, disabled, onSent }: { room: RoomView; game: GameView | null; row?: boolean; disabled: boolean; onSent?: () => void }) {
  const send = useSend();
  const ctx = contextChips(room, game);
  return (
    <div className={`qchips${row ? ' row' : ''}`}>
      {[...ctx, ...STANDARD].map((t, i) => (
        <button
          key={t}
          className={`q${i < ctx.length ? ' ctx' : ''}`}
          disabled={disabled}
          onClick={() => {
            if (send(t)) onSent?.();
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function RecentLines({ room, entries }: { room: RoomView; entries: ChatEntry[] }) {
  return (
    <div className="recent" aria-live="polite">
      {entries.map((e, i) => (
        <div key={`${e.id}-${e.at}`} className={`ln${i < entries.length - 1 ? ' old' : ''}${e.from === room.you ? ' me' : ''}`}>
          <b>{nameOf(room, e.from)}</b>
          <span className="tx">{e.text}</span>
          <span className="when">{ago(e.at)}</span>
        </div>
      ))}
    </div>
  );
}

function Composer({ room, game, onClose }: { room: RoomView; game: GameView | null; onClose: () => void }) {
  const log = useChat((s) => s.log);
  const muted = useChat((s) => s.muted);
  const open = useChat((s) => s.open);
  const hostMuted = !!room.you && room.muted.includes(room.you);
  const recent = log.filter((e) => !muted.includes(e.from)).slice(-2);
  return (
    <Sheet
      variant="short"
      label="Say something"
      title="Say something"
      onClose={onClose}
      action={
        <button className="fullchat" onClick={() => open('log')}>
          Full chat
        </button>
      }
    >
      {recent.length > 0 && <RecentLines room={room} entries={recent} />}
      <Chips room={room} game={game} disabled={hostMuted} onSent={onClose} />
      <Field placeholder="Type a message…" disabled={hostMuted} onSent={onClose} />
      <p className="cnote">Closes by itself when it’s your turn. Anything you were typing is kept.</p>
    </Sheet>
  );
}

function LogName({ room, id }: { room: RoomView; id: string }) {
  const toggleMute = useChat((s) => s.toggleMute);
  const muted = useChat((s) => s.muted.includes(id));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  if (id === room.you) return <span className="who">You</span>;
  return (
    <span
      className="who"
      role="button"
      tabIndex={0}
      aria-label={`${nameOf(room, id)}${muted ? ', muted' : ''}. Long-press to ${muted ? 'unmute' : 'mute'}`}
      onPointerDown={() => {
        cancel();
        timer.current = setTimeout(() => {
          toggleMute(id);
          haptic('medium');
        }, LONG_PRESS_MS);
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => e.key === 'Enter' && toggleMute(id)}
    >
      {nameOf(room, id)}
      {muted && ' · muted'}
    </span>
  );
}

function ChatLog({ room, game, onClose }: { room: RoomView; game: GameView | null; onClose: () => void }) {
  const log = useChat((s) => s.log);
  const muted = useChat((s) => s.muted);
  const onTable = useChat((s) => s.onTable);
  const setOnTable = useChat((s) => s.setOnTable);
  const endRef = useRef<HTMLDivElement>(null);
  const hostMuted = !!room.you && room.muted.includes(room.you);
  const humans = room.members.filter((m) => !m.isBot).length;
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [log.length]);

  const rows: React.ReactNode[] = [];
  log.forEach((e, i) => {
    const prev = i > 0 ? log[i - 1] : null;
    separators(prev, e, room, game).forEach((sep, j) =>
      rows.push(
        <div key={`sep-${e.id}-${e.at}-${j}`} className="ev">
          <span>{sep}</span>
        </div>,
      ),
    );
    const hidden = muted.includes(e.from);
    const mine = e.from === room.you;
    const dealer = game && e.round !== null && e.round === game.round.index && room.members[game.round.dealer]?.id === e.from;
    rows.push(
      <div key={`${e.id}-${e.at}`} className={`m${mine ? ' me' : ''}${e.reaction ? ' rx' : ''}${hidden ? ' hid' : ''}`}>
        <div className="a">{initialOf(nameOf(room, e.from))}</div>
        <div className="b">
          <div className="whorow">
            <LogName room={room} id={e.from} />
            {dealer && <span className="dim"> · dealer</span>}
            {i === log.length - 1 && <span className="dim"> · {ago(e.at)}</span>}
          </div>
          <div className="tx">{hidden ? 'Muted · long-press the name to unmute' : e.text}</div>
        </div>
      </div>,
    );
  });

  return (
    <Sheet label="Table chat" title="Table chat" sub={`${humans} in the room`} onClose={onClose} variant="tall" className="chatlog">
      <div className="qtog">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Show chat on the table</div>
          <div className="dim" style={{ fontSize: 12, lineHeight: 1.35 }}>
            Off keeps only the unread count. Long-press a name to mute them.
          </div>
        </div>
        <button className={`tog${onTable ? ' on' : ''}`} role="switch" aria-checked={onTable} aria-label="Show chat on the table" onClick={() => setOnTable(!onTable)}>
          <i />
        </button>
      </div>
      <div className="msgs" aria-live="polite">
        {rows.length ? rows : <p className="dim" style={{ fontSize: 14, textAlign: 'center', padding: 24 }}>No messages yet. Say hi.</p>}
        <div ref={endRef} />
      </div>
      <div className="foot">
        <Chips room={room} game={game} row disabled={hostMuted} />
        <Field placeholder="Message the table…" disabled={hostMuted} />
      </div>
    </Sheet>
  );
}

/** Composer and log, mounted once per room so chat is reachable from every screen. */
export function ChatSheets({ room, game }: { room: RoomView; game: GameView | null }) {
  const sheet = useChat((s) => s.sheet);
  const close = useChat((s) => s.close);
  const on = room.settings.chat !== false;
  return (
    <div className="chatlayer">
      <AnimatePresence>
        {on && sheet === 'composer' && <Composer key="composer" room={room} game={game} onClose={close} />}
        {on && sheet === 'log' && <ChatLog key="log" room={room} game={game} onClose={close} />}
      </AnimatePresence>
    </div>
  );
}

/** Above the dock on your turn when the composer closed with text in it. */
export function DraftChip() {
  const draft = useChat((s) => s.draft);
  const sheet = useChat((s) => s.sheet);
  const open = useChat((s) => s.open);
  const show = useChatOn() && !!draft.trim() && sheet === null;
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="draft" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
          <Icon.Pencil />
          <span className="tx">Draft saved: “{draft.trim()}”</span>
          <button onClick={() => open('composer')}>Finish</button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The newest message, shown in the hand-header line in place of "Your hand · …". */
export function ChatFlashLine({ room, entry }: { room: RoomView; entry: ChatEntry }) {
  const open = useChat((s) => s.open);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, []);
  return (
    <button className="chatline" onClick={() => open('log')} aria-label={`${nameOf(room, entry.from)} said ${entry.text}. Open chat`}>
      <b>{nameOf(room, entry.from)}</b>
      <span className="tx">{entry.text}</span>
      <span className="when">{ago(entry.at)}</span>
    </button>
  );
}
