import { useState } from 'react';
import type { GameView, RoomView } from '@judgement/engine';
import { usePrefs } from '../lib/prefs';
import { navigate } from '../lib/router';
import { useRoom } from '../net/room';
import { Sheet } from './Sheet';
import { HowTo } from './HowTo';
import { AnimatePresence } from 'motion/react';

export function MenuSheet({ room, game, onClose }: { room: RoomView; game: GameView | null; onClose: () => void }) {
  const prefs = usePrefs();
  const send = useRoom((s) => s.send);
  const disconnect = useRoom((s) => s.disconnect);
  const [confirm, setConfirm] = useState<'leave' | 'end' | null>(null);
  const [howto, setHowto] = useState(false);
  const isHost = room.hostId === room.you;
  const inGame = room.stage === 'game' && game && game.phase !== 'gameEnd';

  const row = (label: string, sub: string | null, on: boolean, toggle: () => void) => (
    <div className="set" style={{ padding: '0 4px 0 4px' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>{label}</div>
        {sub && (
          <div className="dim" style={{ fontSize: 12 }}>
            {sub}
          </div>
        )}
      </div>
      <button className={`tog${on ? ' on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={toggle}>
        <i />
      </button>
    </div>
  );

  return (
    <>
      <Sheet variant="short" title="Room" sub={<span className="mono">{room.code}</span>} onClose={onClose} label="Room menu">
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {row('Sound', null, prefs.sound, () => prefs.set({ sound: !prefs.sound }))}
          {row('Vibration', 'On phones that support it', prefs.haptics, () => prefs.set({ haptics: !prefs.haptics }))}
          {row('Reduced motion', 'Cards fade instead of flying', prefs.reducedMotion, () => prefs.set({ reducedMotion: !prefs.reducedMotion }))}
        </div>
        <button className="btn surf2" onClick={() => setHowto(true)}>
          How to play
        </button>
        {confirm === null ? (
          <div style={{ display: 'flex', gap: 8 }}>
            {isHost && inGame && (
              <button className="btn surf2" style={{ flex: 1, color: 'var(--coral)' }} onClick={() => setConfirm('end')}>
                End game
              </button>
            )}
            <button className="btn surf2" style={{ flex: 1, color: 'var(--coral)' }} onClick={() => setConfirm('leave')}>
              Leave room
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 12, borderRadius: 14, boxShadow: 'inset 0 0 0 1.5px var(--coral)' }}>
            <div style={{ fontSize: 14 }}>
              {confirm === 'end'
                ? 'End the game for everyone? Scores so far become the final result.'
                : inGame
                  ? 'Leave mid-game? The table pauses for you, and the host decides what happens to your seat.'
                  : 'Leave this room?'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn surf" style={{ flex: 1 }} onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button
                className="btn"
                style={{ flex: 1, background: 'var(--coral)', color: '#1C0B08' }}
                onClick={() => {
                  if (confirm === 'end') {
                    send({ type: 'endGame' });
                    onClose();
                  } else {
                    send({ type: 'leave' });
                    setTimeout(() => {
                      disconnect();
                      navigate('/');
                    }, 80);
                  }
                }}
              >
                {confirm === 'end' ? 'End game' : 'Leave'}
              </button>
            </div>
          </div>
        )}
      </Sheet>
      <AnimatePresence>{howto && <HowTo key="howto" onClose={() => setHowto(false)} />}</AnimatePresence>
    </>
  );
}
