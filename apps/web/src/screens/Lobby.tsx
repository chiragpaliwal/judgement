import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DEFAULT_START_CARDS, effectiveStart, MAX_PLAYERS, maxCardsFor, MIN_PLAYERS, type RoomView, type ScoringMode, type TurnTimer } from '@judgement/engine';
import { useRoom } from '../net/room';
import { Icon } from '../ui/icons';
import { initialOf } from '../game/seats';
import { MenuSheet } from './MenuSheet';
import { copyText, shareOrCopy } from '../lib/share';

/** 01 · Lobby. */
export function Lobby({ room }: { room: RoomView }) {
  const send = useRoom((s) => s.send);
  const [copied, setCopied] = useState(false);
  const [menu, setMenu] = useState(false);
  const isHost = room.hostId === room.you;
  const n = room.members.length;
  const open = MAX_PLAYERS - n;
  const link = `${location.origin}/r/${room.code}`;
  const st = room.settings;
  const players = Math.max(n, MIN_PLAYERS);
  const max = maxCardsFor(players);
  const eff = effectiveStart(st.startCards, players);
  const host = room.members.find((m) => m.isHost);

  const startNote = st.startCards >= max ? `Full deck · ${eff} → 1, ${eff} rounds` : `${eff} → 1, ${eff} rounds`;

  const flash = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  const copy = async () => {
    if (await copyText(link)) flash();
    else window.prompt('Copy this link', link);
  };
  const share = async () => {
    const r = await shareOrCopy({ title: 'Judgement', text: `Join my Judgement table · room ${room.code}`, url: link });
    if (r === 'copied') flash();
    else if (r === 'failed') window.prompt('Copy this link', link);
  };

  return (
    <main className="scr">
      <header style={{ height: 56, display: 'flex', alignItems: 'center', padding: '0 4px 0 16px', gap: 10, flex: 'none' }}>
        <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>Judgement</div>
        <div className="dim" style={{ fontSize: 13 }}>
          · room
        </div>
        <div style={{ flex: 1 }} />
        <button className="ib" aria-label="Room menu" onClick={() => setMenu(true)}>
          <Icon.More />
        </button>
      </header>
      <div className="scroll" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', paddingBottom: 8 }}>
        <section style={{ margin: '4px 12px 0', padding: '18px 16px 16px', borderRadius: 18, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="k">Room code</div>
          <div className="mono" style={{ fontSize: 52, fontWeight: 500, letterSpacing: '0.14em', lineHeight: 1 }} aria-label={`Room code ${room.code.split('').join(' ')}`}>
            {room.code}
          </div>
          <div className="mono dim" style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {link.replace(/^https?:\/\//, '')}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn amber" style={{ flex: 1, height: 48, borderRadius: 12, fontSize: 15 }} onClick={share}>
              <Icon.Share size={18} />
              {copied ? 'Link copied' : 'Share invite'}
            </button>
            <button className="btn surf2" style={{ width: 48, height: 48, borderRadius: 12, padding: 0 }} aria-label="Copy link" onClick={copy}>
              {copied ? <Icon.Check size={20} /> : <Icon.Copy size={20} />}
            </button>
          </div>
        </section>

        <section style={{ margin: '20px 12px 0', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', padding: '0 12px 6px' }}>
            <div className="k">Players</div>
            <div className="mono dim" style={{ marginLeft: 'auto', fontSize: 12 }}>
              {n} of {MAX_PLAYERS} · {MIN_PLAYERS} needed to start
            </div>
          </div>
          <AnimatePresence initial={false}>
            {room.members.map((m) => {
              const you = m.id === room.you;
              return (
                <motion.div
                  key={m.id}
                  className="prow"
                  layout
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  style={{ background: you ? '#1A1E26' : 'transparent' }}
                >
                  <div className="av-s">{m.isBot ? <Icon.Bot size={16} /> : you ? 'Y' : initialOf(m.name)}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{you ? 'You' : m.name}</div>
                  {m.isHost && <div className="k">host</div>}
                  {m.isBot && <span className="bot-tag">BOT</span>}
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }} className="dim">
                    <i className={`ok${m.connected ? '' : ' away'}`} />
                    {m.isBot ? 'ready' : m.connected ? 'here' : 'away'}
                  </div>
                  {isHost && !you && (
                    <button className="ib" style={{ width: 36, height: 36, marginRight: -8 }} aria-label={`Remove ${m.name}`} onClick={() => send({ type: 'removeMember', id: m.id })}>
                      <Icon.X size={16} />
                    </button>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {open > 0 && (
            <div className="prow" style={{ boxShadow: 'inset 0 0 0 1px var(--line)', borderRadius: 12, marginTop: 6, paddingRight: 6 }}>
              <div className="av-s" style={{ background: 'none', border: '1.5px dashed #4A505B' }}>
                +
              </div>
              <div className="dim" style={{ fontSize: 14, flex: 1, padding: '10px 0' }}>
                {open} open seat{open === 1 ? '' : 's'}. Anyone with the link can join.
              </div>
              {isHost && (
                <button className="btn surf2" style={{ height: 36, borderRadius: 10, fontSize: 13, padding: '0 12px', flex: 'none' }} onClick={() => send({ type: 'addBot' })}>
                  <Icon.Bot size={16} />
                  Add bot
                </button>
              )}
            </div>
          )}
        </section>

        <section style={{ margin: '20px 12px 0', borderRadius: 16, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column' }} aria-label="Game settings">
          <div className="set">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Start with</div>
              <div className="dim" style={{ fontSize: 12 }}>
                {startNote}
              </div>
            </div>
            <button className="stp" aria-label="Fewer cards" disabled={!isHost || eff <= 1} onClick={() => send({ type: 'setSettings', startCards: eff - 1 })}>
              −
            </button>
            <div className="mono" style={{ width: 28, textAlign: 'center', fontSize: 18 }} aria-live="polite">
              {eff}
            </div>
            <button className="stp" aria-label="More cards" disabled={!isHost || eff >= max} onClick={() => send({ type: 'setSettings', startCards: eff + 1 >= max ? DEFAULT_START_CARDS : eff + 1 })}>
              +
            </button>
          </div>
          <div className="set">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Card tracker</div>
              <div className="dim" style={{ fontSize: 12 }}>
                Everyone can see cards already played
              </div>
            </div>
            <button className={`tog${st.tracker ? ' on' : ''}`} role="switch" aria-checked={st.tracker} aria-label="Card tracker" disabled={!isHost} onClick={() => send({ type: 'setSettings', tracker: !st.tracker })}>
              <i />
            </button>
            <div style={{ width: 10 }} />
          </div>
          <div className="set">
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Turn timer</div>
            <div className="seg2" role="radiogroup" aria-label="Turn timer">
              {([0, 30, 60] as TurnTimer[]).map((t) => (
                <button key={t} className={st.turnTimer === t ? 'on' : ''} role="radio" aria-checked={st.turnTimer === t} disabled={!isHost} onClick={() => send({ type: 'setSettings', turnTimer: t })}>
                  {t === 0 ? 'Off' : `${t}s`}
                </button>
              ))}
            </div>
          </div>
          <div className="set">
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>Scoring</div>
              <div className="dim" style={{ fontSize: 12 }}>
                {st.scoring === 'stakes' ? 'Bid 1 wins or loses 21, bid 2 is 32' : '10 + bid if exact, miss scores 0'}
              </div>
            </div>
            <div className="seg2" role="radiogroup" aria-label="Scoring">
              {(['classic', 'stakes'] as ScoringMode[]).map((m) => (
                <button key={m} className={st.scoring === m ? 'on' : ''} role="radio" aria-checked={st.scoring === m} disabled={!isHost} onClick={() => send({ type: 'setSettings', scoring: m })}>
                  {m === 'classic' ? 'Classic' : 'High stakes'}
                </button>
              ))}
            </div>
          </div>
        </section>
        {!isHost && (
          <p className="dim" style={{ fontSize: 12, padding: '10px 24px 0' }}>
            Only {host?.name ?? 'the host'} can change settings.
          </p>
        )}
      </div>
      <div style={{ padding: '12px 12px calc(16px + var(--safe-b))', flex: 'none' }}>
        {isHost ? (
          <button className="btn light" style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 17 }} disabled={n < MIN_PLAYERS} onClick={() => send({ type: 'start' })}>
            {n < MIN_PLAYERS ? `Need ${MIN_PLAYERS - n} more to deal` : `Deal · ${n} players`}
          </button>
        ) : (
          <div className="btn ghost" style={{ width: '100%', height: 56, borderRadius: 16, fontSize: 15 }} role="status">
            Waiting for {host?.name ?? 'the host'} to deal
          </div>
        )}
      </div>
      <AnimatePresence>{menu && <MenuSheet room={room} game={null} onClose={() => setMenu(false)} />}</AnimatePresence>
    </main>
  );
}
