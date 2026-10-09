import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CODE_ALPHABET, CODE_LENGTH, isRoomCode, NAME_MAX, type Card } from '@judgement/engine';
import { getName, setName } from '../lib/identity';
import { navigate } from '../lib/router';
import { unlockAudio } from '../lib/fx';
import { CardFace } from '../ui/Card';
import { HowTo } from './HowTo';

const FAN: Card[] = ['Ah', 'Ks', 'Qd', 'Jc'];

export function NameField({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="k">Your name</span>
      <input
        className="field"
        value={value}
        maxLength={NAME_MAX}
        autoFocus={autoFocus}
        autoComplete="nickname"
        placeholder="What should the table call you?"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

export function Home() {
  const [name, setNameState] = useState(getName());
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [howto, setHowto] = useState(false);
  const okName = name.trim().length > 0;

  const create = async () => {
    if (!okName || busy) return;
    unlockAudio();
    setName(name);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', { method: 'POST' });
      if (!res.ok) throw new Error();
      const { code } = (await res.json()) as { code: string };
      navigate(`/r/${code}`);
    } catch {
      setError('Couldn’t create a room. Check your connection and try again.');
      setBusy(false);
    }
  };

  const join = async () => {
    const c = code.toUpperCase();
    if (!okName || !isRoomCode(c)) return;
    unlockAudio();
    setName(name);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/rooms/${c}`);
      const body = (await res.json()) as { exists: boolean; stage?: string };
      if (!body.exists) {
        setError(`No room called ${c}. Check the code with your host.`);
        setBusy(false);
        return;
      }
      navigate(`/r/${c}`);
    } catch {
      setError('Couldn’t reach the server. Try again.');
      setBusy(false);
    }
  };

  const cleanCode = (v: string) =>
    v
      .toUpperCase()
      .split('')
      .filter((ch) => CODE_ALPHABET.includes(ch))
      .join('')
      .slice(0, CODE_LENGTH);

  return (
    <main className="scr">
      <div className="scroll" style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', padding: '0 12px' }}>
        <div style={{ height: 200, position: 'relative', flex: 'none', marginTop: 12 }} aria-hidden>
          {FAN.map((c, i) => (
            <motion.span
              key={c}
              style={{ position: 'absolute', left: '50%', top: 40, width: 76, height: 106, marginLeft: -38, borderRadius: 10, transformOrigin: '50% 160%' }}
              className="howto-card hero-fan"
              initial={{ rotate: 0, y: 40, opacity: 0 }}
              animate={{ rotate: (i - 1.5) * 12, y: Math.abs(i - 1.5) * 6, opacity: 1 }}
              transition={{ delay: 0.1 + i * 0.07, duration: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <CardFace card={c} trump="h" win={false} />
            </motion.span>
          ))}
          <style>{`.hero-fan .cf{padding:7px;box-shadow:0 10px 24px rgba(0,0,0,.45)}.hero-fan .cf .rk{font-size:22px}.hero-fan .cf svg.pip-s{width:26px;height:26px}.hero-fan .cf .tn{border-top-width:14px;border-left-width:14px}`}</style>
        </div>
        <header style={{ padding: '0 8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 style={{ fontSize: 46, fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>Judgement</h1>
          <p className="dim" style={{ fontSize: 16, lineHeight: 1.4 }}>
            Call exactly how many tricks you’ll take. 3 to 7 friends, one link.
          </p>
        </header>

        <section style={{ marginTop: 24, padding: 16, borderRadius: 18, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <NameField value={name} onChange={setNameState} />
          <button className="btn amber" disabled={!okName || busy} onClick={create}>
            {busy ? 'Opening a table…' : 'Create a room'}
          </button>
        </section>

        <section style={{ marginTop: 10, padding: 16, borderRadius: 18, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span className="k">Have a code?</span>
          <form
            style={{ display: 'flex', gap: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              void join();
            }}
          >
            <input
              className="field mono"
              style={{ letterSpacing: '0.3em', textTransform: 'uppercase', fontSize: 20, flex: 1, minWidth: 0 }}
              value={code}
              placeholder="K7QD"
              aria-label="Room code"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              onChange={(e) => setCode(cleanCode(e.target.value))}
            />
            <button className="btn light" type="submit" style={{ flex: 'none', width: 96 }} disabled={!okName || code.length !== CODE_LENGTH || busy}>
              Join
            </button>
          </form>
          {!okName && code.length === CODE_LENGTH && (
            <span className="dim" style={{ fontSize: 12 }}>
              Add your name above first.
            </span>
          )}
        </section>

        <AnimatePresence>
          {error && (
            <motion.div className="toast" style={{ margin: '10px 0 0' }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="alert">
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        <button className="dim" style={{ margin: '18px auto 0', fontSize: 14, padding: 12, textDecoration: 'underline', textUnderlineOffset: 4 }} onClick={() => setHowto(true)}>
          How to play
        </button>
        <div style={{ flex: 1, minHeight: 16 }} />
      </div>
      <AnimatePresence>{howto && <HowTo onClose={() => setHowto(false)} />}</AnimatePresence>
    </main>
  );
}
