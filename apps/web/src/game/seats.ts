import {
  alive,
  hookedBid,
  need,
  nextSeat,
  openTrick,
  outReason,
  status,
  type GameView,
  type RoomView,
} from '@judgement/engine';

export type BadgeKind = 'need' | 'zero' | 'out' | 'bid' | 'wait' | 'mine' | 'none';
export type PipKind = 'won' | 'need' | 'claim' | 'mine' | 'over' | 'dead' | 'zero' | 'zx' | 'zclaim';
export type TagTone = 'blue' | 'bad' | 'hot' | 'dim';

export interface SeatModel {
  seat: number;
  id: string;
  name: string;
  initial: string;
  me: boolean;
  dealer: boolean;
  /** Leads the first trick (shown while bidding). */
  leads: boolean;
  turn: boolean;
  alive: boolean;
  out: boolean;
  away: boolean;
  autoplay: boolean;
  isBot: boolean;
  badge: { kind: BadgeKind; text: string };
  pips: PipKind[] | { meter: true; won: number; bid: number };
  tag: { text: string; tone: TagTone } | null;
}

export const initialOf = (name: string) => {
  const clean = name.replace(/^Bot\s+/i, '');
  return (clean.trim()[0] ?? '?').toUpperCase();
};

/** Display names by seat: "You" for the local player. */
export function seatNames(room: RoomView, game: GameView | null): string[] {
  return room.members.map((m, i) => (game && i === game.me ? 'You' : m.name));
}

/**
 * Per-seat display model (DESIGN_SPEC §4.3).
 * `held` = a finished trick is still on screen, so nobody is "on turn" yet.
 */
export function buildSeats(room: RoomView, game: GameView, pendingBid: number | null, held: boolean): SeatModel[] {
  const r = game.round;
  const bidding = game.phase === 'bidding';
  const active = game.phase === 'bidding' || game.phase === 'playing';
  const plays = openTrick(r)?.plays.length ?? 0;

  return room.members.map((m, seat) => {
    const me = seat === game.me;
    const bid = r.bids[seat];
    const won = r.won[seat];
    const turn = active && r.turn === seat && !held && !room.pause;
    const isNext = active && !held && (r.turn + 1) % game.n === seat;
    let badge: SeatModel['badge'] = { kind: 'none', text: '' };
    let pips: SeatModel['pips'] = [];
    let tag: SeatModel['tag'] = null;
    let out = false;
    let isAlive = false;

    if (bidding) {
      if (bid !== null) badge = { kind: 'bid', text: String(bid) };
      else if (me && pendingBid !== null) badge = { kind: 'mine', text: String(pendingBid) };
      else if (turn) badge = { kind: 'wait', text: '…' };

      const shown = bid ?? (me ? pendingBid : null);
      if (shown !== null) {
        if (shown > 8) pips = { meter: true, won: 0, bid: shown };
        else if (shown === 0) pips = ['zclaim'];
        else pips = Array(shown).fill(bid === null ? 'mine' : 'claim');
      }

      if (turn && !me) tag = seat === r.dealer && hookedBid(r, seat) !== null ? { text: 'on the hook', tone: 'hot' } : { text: 'choosing', tone: 'hot' };
      else if (turn && me) tag = seat === r.dealer && hookedBid(r, seat) !== null ? { text: 'on the hook', tone: 'hot' } : { text: 'choosing', tone: 'hot' };
      else if (me && bid === null && isNext) tag = { text: 'next', tone: 'hot' };
    } else {
      const b = bid ?? 0;
      const st = status(r, seat);
      out = st === 'out';
      isAlive = !out && game.phase === 'playing' && alive(r, seat);

      if (out) badge = { kind: 'out', text: '×' };
      else {
        const n = need(b, won);
        badge = n === 0 ? { kind: 'zero', text: '0' } : { kind: 'need', text: String(n) };
      }

      if (b > 8) pips = { meter: true, won, bid: b };
      else if (b === 0) pips = [won > 0 ? 'zx' : 'zero'];
      else {
        const list: PipKind[] = [];
        for (let i = 0; i < b; i++) list.push(i < won ? 'won' : out ? 'dead' : 'need');
        for (let i = b; i < won; i++) list.push('over');
        pips = list;
      }

      // Priority: alive > out reason > choosing > next > dodge/hold.
      if (isAlive) tag = { text: 'all on this', tone: 'hot' };
      else if (out) {
        const why = outReason(r, seat);
        tag = why?.kind === 'over' ? { text: b === 0 ? `took ${won}` : `took ${won}`, tone: 'bad' } : { text: 'can’t reach', tone: 'bad' };
      } else if (turn && !me) tag = { text: 'choosing', tone: 'hot' };
      else if (!me && isNext && plays > 0 && plays + 1 < game.n) tag = { text: 'next', tone: 'hot' };
      else if (st === 'dodge') tag = { text: 'dodge', tone: 'blue' };
      else if (st === 'hold') tag = { text: 'hold', tone: 'blue' };
    }

    return {
      seat,
      id: m.id,
      name: me ? 'You' : m.name,
      initial: me ? 'Y' : initialOf(m.name),
      me,
      dealer: seat === r.dealer,
      leads: bidding && seat === nextSeat(r.dealer, game.n),
      turn,
      alive: isAlive,
      out,
      away: !m.connected && !m.isBot,
      autoplay: m.autoplay,
      isBot: m.isBot,
      badge,
      pips,
      tag,
    };
  });
}
