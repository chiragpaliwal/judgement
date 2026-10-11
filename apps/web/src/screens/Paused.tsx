import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { HOLD_MS, VOTE_WINDOW_MS, type GameView, type RoomView } from '@judgement/engine';
import { Icon } from '../ui/icons';
import { serverNow, useRoom } from '../net/room';
import { initialOf } from '../game/seats';
import { ReactionDock } from './GameScreen';

function useNow(ms = 250) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return serverNow();
}

/** True for a few seconds after the table votes to keep waiting, so the silent reset of the votes is explained. */
function useExtendedFlash(extensions: number) {
  const prev = useRef(extensions);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (extensions <= prev.current) {
      prev.current = extensions;
      return;
    }
    prev.current = extensions;
    setOn(true);
    const t = setTimeout(() => setOn(false), 5000);
    return () => clearTimeout(t);
  }, [extensions]);
  return on;
}

/** 12 · Paused: someone dropped. */
export function Paused({ room, game }: { room: RoomView; game: GameView }) {
  const send = useRoom((s) => s.send);
  const now = useNow();
  const p = room.pause!;
  const seat = room.members.findIndex((m) => m.id === p.playerId);
  const who = room.members[seat];
  const isHost = room.hostId === room.you;
  const youVoted = !!room.you && p.votes.includes(room.you);
  const voters = room.members.filter((m) => !m.isBot && m.connected && m.id !== p.playerId);
  const left = Math.max(0, p.holdUntil - now);
  const frac = p.expired ? 0 : Math.min(1, left / HOLD_MS);
  const secs = Math.ceil(left / 1000);
  const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  const theirTurn = game.round.turn === seat;
  const name = who?.name ?? 'A player';
  const C = 2 * Math.PI * 68;
  const voteOpen = p.expired || left <= VOTE_WINDOW_MS;
  const opensIn = Math.ceil((left - VOTE_WINDOW_MS) / 1000);
  const extended = useExtendedFlash(p.extensions);

  return (
    <motion.div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(14,16,20,.97)', display: 'flex', flexDirection: 'column' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <header style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flex: 'none' }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--coral)' }} />
        <span style={{ fontSize: 15, fontWeight: 600 }}>Paused</span>
        <span className="dim" style={{ fontSize: 13 }}>
          · Round {game.round.index + 1}, trick {Math.min(game.round.cards, game.round.tricksDone + 1)}
        </span>
      </header>
      <motion.section
        role="alertdialog"
        aria-label={`${name} lost connection`}
        style={{ margin: '40px 12px 0', flex: '1 1 auto', borderRadius: 24, background: 'var(--surface-1)', padding: '28px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18, boxShadow: '0 30px 60px rgba(0,0,0,.6)', overflowY: 'auto' }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <div style={{ width: 150, height: 150, position: 'relative', display: 'grid', placeItems: 'center', flex: 'none' }}>
          <svg viewBox="0 0 150 150" style={{ position: 'absolute', inset: 0 }} aria-hidden>
            <circle cx="75" cy="75" r="68" fill="none" stroke="#262B34" strokeWidth="6" />
            <circle cx="75" cy="75" r="68" fill="none" stroke={p.expired ? 'var(--coral)' : 'var(--amber)'} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 75 75)" style={{ transition: 'stroke-dashoffset .25s linear' }} />
          </svg>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 26, fontWeight: 600, color: '#DCE0E6', position: 'relative' }}>
            {initialOf(name)}
            <span style={{ position: 'absolute', right: -6, bottom: -6, width: 28, height: 28, borderRadius: '50%', background: 'var(--coral)', color: '#1C0B08', display: 'grid', placeItems: 'center', boxShadow: '0 0 0 3px var(--surface-1)' }}>
              <Icon.Offline size={15} />
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>{name} lost connection</div>
          <div className="dim" style={{ fontSize: 14, lineHeight: 1.4 }}>
            {theirTurn ? `It’s ${name}’s turn. ` : ''}
            {p.expired ? (
              <>The hold ran out. {isHost ? 'You decide what happens next.' : 'The host decides what happens next.'}</>
            ) : (
              <>
                The seat and cards are held for <span className="mono" style={{ color: 'var(--amber)' }}>{time}</span>. Nobody can see that hand.
              </>
            )}
          </div>
        </div>
        {extended && (
          <motion.div
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            style={{ padding: '6px 12px', borderRadius: 999, background: 'rgba(255,184,77,.14)', color: 'var(--amber)', fontSize: 13, fontWeight: 600 }}
          >
            Majority voted to wait · +1:00 added
          </motion.div>
        )}
        {voters.length > 0 && voteOpen && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {voters.map((m) => (
                <span key={m.id} style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 600, boxShadow: p.votes.includes(m.id) ? '0 0 0 2px var(--blue)' : undefined }}>
                  {m.id === room.you ? 'Y' : initialOf(m.name)}
                </span>
              ))}
            </div>
            <span className="dim" style={{ fontSize: 12 }}>
              {p.votes.length} of {voters.length} want to wait
            </span>
          </div>
        )}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 'auto' }}>
          <button
            className="opt"
            style={{ width: '100%', minHeight: 56, borderRadius: 14, background: youVoted ? 'var(--text)' : 'var(--surface-2)', color: youVoted ? 'var(--bg)' : 'var(--text)', opacity: voteOpen ? 1 : 0.55, display: 'flex', alignItems: 'center', padding: '8px 16px', textAlign: 'left' }}
            onClick={() => send({ type: 'voteWait' })}
            disabled={youVoted || !voteOpen}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{p.expired ? 'Wait another minute' : 'Keep waiting'}</div>
              <div style={{ fontSize: 12, color: youVoted ? '#4A505B' : 'var(--text-dim)' }}>
                {!voteOpen
                  ? `Voting opens in ${opensIn}s${p.extensions > 0 ? ` · extended ${p.extensions}×` : ''}`
                  : youVoted
                    ? 'You voted · waiting for the others'
                    : 'Adds 1 min if most agree'}
              </div>
            </div>
          </button>
          <button
            className="opt"
            style={{ width: '100%', minHeight: 56, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', padding: '8px 16px', textAlign: 'left', opacity: isHost ? 1 : 0.55 }}
            disabled={!isHost}
            onClick={() => send({ type: 'autoplay', id: p.playerId, on: true })}
          >
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>Play {name}’s turns</div>
              <div className="dim" style={{ fontSize: 12 }}>
                Host only · plays a legal low card. {name} can take back over.
              </div>
            </div>
          </button>
          {isHost && (
            <button style={{ minHeight: 44, color: 'var(--coral)', fontSize: 14, fontWeight: 600 }} onClick={() => send({ type: 'endGame' })}>
              End game for everyone
            </button>
          )}
        </div>
      </motion.section>
      <div style={{ marginTop: 'auto' }}>
        <ReactionDock pausedSet />
      </div>
    </motion.div>
  );
}
