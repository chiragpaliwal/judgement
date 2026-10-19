import { useEffect, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import type { GameView, RoomView } from '@judgement/engine';
import { useRoom } from '../net/room';
import { getName, setName } from '../lib/identity';
import { navigate } from '../lib/router';
import { unlockAudio } from '../lib/fx';
import { useTurnTitle, useWakeLock } from '../lib/presence';
import { Lobby } from './Lobby';
import { GameScreen } from './GameScreen';
import { RoundSummary } from './RoundSummary';
import { Results } from './Results';
import { NameField } from './Home';
import { ChatSheets } from './Chat';
import { chatDisabled, useChat } from '../net/chat';

function useCompact() {
  const [compact, set] = useState(() => window.innerWidth <= 360);
  useEffect(() => {
    const on = () => set(window.innerWidth <= 360);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return compact;
}

function Notice({ title, body, action }: { title: string; body: string; action?: { label: string; run: () => void } }) {
  return (
    <main className="scr" style={{ justifyContent: 'center', paddingInline: 20, gap: 14 }}>
      <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', lineHeight: 1.1 }}>{title}</h1>
      <p className="dim" style={{ fontSize: 15, lineHeight: 1.45 }}>
        {body}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
        {action && (
          <button className="btn amber" onClick={action.run}>
            {action.label}
          </button>
        )}
        <button className="btn surf" onClick={() => navigate('/')}>
          Back to home
        </button>
      </div>
    </main>
  );
}

export function RoomPage({ code }: { code: string }) {
  const [named, setNamed] = useState(() => getName().length > 0);
  const [draft, setDraft] = useState('');
  const { connect, disconnect, status, issue, room, game } = useRoom();
  const held = useRoom((s) => s.held);
  const compact = useCompact();
  const inPlay = room?.stage === 'game' && !!game && game.phase !== 'gameEnd';
  // Final results stay on this phone until its player leaves them, even after someone else's
  // rematch sends the room back to the lobby and the server drops the game.
  const [finale, setFinale] = useState<{ room: RoomView; game: GameView } | null>(null);
  const [finaleDone, setFinaleDone] = useState(false);
  const liveEnd = room?.stage === 'game' && game?.phase === 'gameEnd';
  useEffect(() => {
    if (liveEnd && !finaleDone) setFinale({ room: room!, game: game! });
    if (inPlay) {
      setFinale(null);
      setFinaleDone(false);
    }
  }, [room, game, liveEnd, inPlay, finaleDone]);
  const myTurn =
    inPlay && !room.pause && game.me !== null && game.round.turn === game.me && (game.phase === 'bidding' || game.phase === 'playing');
  useWakeLock(inPlay);
  useTurnTitle(myTurn);
  const chatOn = room?.settings.chat !== false;
  useEffect(() => {
    if (!chatOn) chatDisabled();
  }, [chatOn]);
  // Your turn wins: chat sheets step aside and whatever was typed stays as a draft.
  useEffect(() => {
    if (myTurn && !held) useChat.getState().close();
  }, [myTurn, held]);

  useEffect(() => {
    if (!named) return;
    connect(code);
  }, [code, named, connect]);
  useEffect(() => () => disconnect(), [disconnect]);
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible' && useRoom.getState().held) useRoom.getState().clearHeld();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (!named) {
    return (
      <main className="scr" style={{ paddingInline: 12 }}>
        <header style={{ padding: '40px 8px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="k">Joining room</div>
          <div className="mono" style={{ fontSize: 52, fontWeight: 500, letterSpacing: '0.14em', lineHeight: 1 }}>
            {code}
          </div>
        </header>
        <form
          style={{ padding: 16, borderRadius: 18, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 14 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!draft.trim()) return;
            unlockAudio();
            setName(draft);
            setNamed(true);
          }}
        >
          <NameField value={draft} onChange={setDraft} autoFocus />
          <button className="btn amber" type="submit" disabled={!draft.trim()}>
            Take a seat
          </button>
        </form>
      </main>
    );
  }

  if (issue === 'no_room') return <Notice title="No room here" body={`There’s no open room called ${code}. It may have expired after 30 quiet minutes. Ask your host for a fresh link.`} />;
  if (issue === 'in_progress') return <Notice title="Game in progress" body="This table has already dealt. You can join when they start the next game." action={{ label: 'Try again', run: () => location.reload() }} />;
  if (issue === 'full') return <Notice title="Table’s full" body="This room already has 7 players." />;
  if (issue === 'removed') return <Notice title="You were removed" body="The host removed you from this room." />;
  if (issue === 'left') return <Notice title="You left the room" body="Your seat is held while the game is on." action={{ label: 'Rejoin', run: () => location.reload() }} />;
  if (issue === 'replaced')
    return (
      <Notice
        title="Opened somewhere else"
        body="This room is open in another tab or device. Only one can play your seat."
        action={{
          label: 'Use it here',
          run: () => {
            disconnect();
            setTimeout(() => connect(code), 50);
          },
        }}
      />
    );

  if (!room) {
    return (
      <main className="scr" style={{ alignItems: 'center', justifyContent: 'center', gap: 14 }}>
        <span style={{ width: 28, height: 28, borderRadius: '50%', border: '2.5px solid var(--surface-3)', borderTopColor: 'var(--amber)', animation: 'spin .8s linear infinite' }} />
        <span className="dim" style={{ fontSize: 14 }}>
          {status === 'reconnecting' ? 'Reconnecting…' : `Joining ${code}…`}
        </span>
      </main>
    );
  }

  const banner = status === 'reconnecting' && (
    <div role="status" style={{ position: 'fixed', top: 'calc(8px + var(--safe-t))', left: '50%', transform: 'translateX(-50%)', zIndex: 60, background: 'var(--surface-2)', borderRadius: 14, padding: '6px 12px', fontSize: 12, boxShadow: '0 6px 20px rgba(0,0,0,.5)' }}>
      Reconnecting…
    </div>
  );

  let screen: React.ReactNode;
  const leaveResults = () => {
    setFinaleDone(true);
    setFinale(null);
  };
  if (finale && !finaleDone && !inPlay && !(liveEnd && held))
    screen = <Results key="results" room={liveEnd ? room : finale.room} game={liveEnd ? game! : finale.game} live={liveEnd} onLeave={leaveResults} />;
  else if (room.stage === 'lobby' || !game) screen = <Lobby key="lobby" room={room} />;
  else if (game.phase === 'gameEnd' && !held) screen = <Results key="results" room={room} game={game} live onLeave={leaveResults} />;
  else if (game.phase === 'roundEnd' && !held) screen = <RoundSummary key={`sum-${game.round.index}`} room={room} game={game} />;
  else screen = <GameScreen key="game" room={room} game={game} compact={compact} />;

  return (
    <>
      {banner}
      <AnimatePresence mode="wait">{screen}</AnimatePresence>
      <ChatSheets room={room} game={game} />
    </>
  );
}
