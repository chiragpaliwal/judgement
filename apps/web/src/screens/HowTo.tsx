import type { ReactNode } from 'react';
import type { Card, Suit } from '@judgement/engine';
import { CardFace } from '../ui/Card';
import { Icon, SuitIcon } from '../ui/icons';
import { Sheet } from './Sheet';

function Mini({ cards, trump, win }: { cards: Card[]; trump?: Suit; win?: number }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '2px 0' }}>
      {cards.map((c, i) => (
        <span key={c} className="howto-card" style={{ width: 40, height: 56, borderRadius: 6, display: 'block' }}>
          <CardFace card={c} trump={trump} win={i === win} />
        </span>
      ))}
    </div>
  );
}

function Step({ n, title, children, art }: { n: number; title: string; children: ReactNode; art?: ReactNode }) {
  return (
    <section style={{ margin: '0 12px', padding: 16, borderRadius: 18, background: 'var(--surface-1)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className="mono" style={{ color: 'var(--amber)', fontSize: 14 }}>
          {n}
        </span>
        <h3 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>{title}</h3>
      </div>
      <div className="dim" style={{ fontSize: 14, lineHeight: 1.45 }}>
        {children}
      </div>
      {art}
    </section>
  );
}

export function HowTo({ onClose }: { onClose: () => void }) {
  return (
    <Sheet variant="full" title="How to play" onClose={onClose} label="How to play">
      <style>{`.howto-card .cf{padding:4px}.howto-card .cf .rk{font-size:14px}.howto-card .cf svg.pip-s{width:16px;height:16px}.howto-card .cf .tn{border-top-width:9px;border-left-width:9px}`}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 'calc(24px + var(--safe-b))' }}>
        <p className="dim" style={{ padding: '0 20px 6px', fontSize: 15, lineHeight: 1.45 }}>
          Call exactly how many tricks you’ll take. Not one more, not one less.
        </p>
        <Step n={1} title="Rounds get shorter" art={<Mini cards={['Ah', '9s', '4d']} trump="h" />}>
          The first round deals up to 8 cards each, then one fewer each round, down to a single card. Trump rotates every round: <TrumpOrder />.
        </Step>
        <Step n={2} title="Bid your tricks">
          Starting left of the dealer, everyone says how many tricks they’ll win. Bids are public as soon as they’re made.
        </Step>
        <Step
          n={3}
          title="The dealer is on the hook"
          art={
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
              <span style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--amber)', color: 'var(--on-amber)', display: 'grid', placeItems: 'center' }}>
                <Icon.Hook size={20} />
              </span>
              <span className="dim">4 cards, 3 already bid → the dealer can’t bid 1.</span>
            </div>
          }
        >
          The dealer bids last and can’t pick the number that makes all bids add up to the cards dealt. So someone always misses.
        </Step>
        <Step n={4} title="Follow suit" art={<Mini cards={['Td', '6c', 'Kd']} trump="s" win={2} />}>
          Whoever leads sets the suit. You must follow it if you can. If you can’t, play anything, including a trump. Highest trump wins, otherwise the highest card of the led suit.
        </Step>
        <Step n={5} title="Scoring">
          Exactly right: <b style={{ color: 'var(--text)' }}>10 + your bid</b>. Bid 0 and take none: 10. Bid 3 and take 3: 13. Any miss scores 0. Highest total after the 1-card round wins.
        </Step>
        <Step n={6} title="Reading the table">
          The number on each avatar is how many tricks that player still needs. <span style={{ color: 'var(--blue)' }}>Blue 0</span> means they want to lose the rest. <span style={{ color: 'var(--coral)' }}>×</span> means they can no longer make it. The centre says whether the table is <span style={{ color: 'var(--amber)' }}>short</span> (more tricks wanted than left) or has some <span style={{ color: 'var(--blue)' }}>spare</span>.
        </Step>
      </div>
    </Sheet>
  );
}

function TrumpOrder() {
  return (
    <span style={{ display: 'inline-flex', gap: 4, verticalAlign: 'middle' }}>
      {(['h', 's', 'd', 'c'] as Suit[]).map((s) => (
        <SuitIcon key={s} suit={s} dark style={{ width: 14, height: 14 }} />
      ))}
    </span>
  );
}
