import { describe, expect, it } from 'vitest';
import { GRACE_MS, HOLD_MS, legalBids, legalCards, ledSuit, openTrick, type ClientMsg } from '@judgement/engine';
import { newRoomState, RoomCore } from './core';

function seeded(seed = 1) {
  let a = seed;
  return () => {
    a = (a * 1664525 + 1013904223) >>> 0;
    return a / 2 ** 32;
  };
}

function setup(humans: number, bots: number, opts: { timer?: 0 | 30 | 60; start?: number } = {}) {
  let now = 1_000_000;
  const core = new RoomCore(newRoomState('K7QD', now), seeded(7));
  const ids: string[] = [];
  for (let i = 0; i < humans; i++) {
    const r = core.join(`device-${i}-xxxxxxxx`, `P${i}`, now);
    if (!r.ok) throw new Error('join failed');
    ids.push(r.playerId);
  }
  const host = ids[0];
  const send = (id: string, msg: ClientMsg) => core.handle(id, msg, now);
  for (let i = 0; i < bots; i++) expect(send(host, { type: 'addBot' }).error).toBeUndefined();
  send(host, { type: 'setSettings', startCards: opts.start ?? 8, turnTimer: opts.timer ?? 0 });
  const advance = (ms: number) => {
    now += ms;
    return core.tick(now);
  };
  return { core, ids, host, send, advance, get now() { return now; } };
}

/** Let the seat to act take its lowest legal action if it is human. */
function humanAct(t: ReturnType<typeof setup>) {
  const g = t.core.s.game!;
  const seat = g.round.turn;
  const m = t.core.s.members[seat];
  if (m.isBot || m.autoplay) return false;
  if (g.phase === 'bidding') {
    const out = t.send(m.id, { type: 'bid', bid: legalBids(g.round, seat)[0] });
    expect(out.error).toBeUndefined();
  } else {
    const card = legalCards(g.round.hands[seat], ledSuit(openTrick(g.round)?.plays ?? []))[0];
    const out = t.send(m.id, { type: 'play', card });
    expect(out.error).toBeUndefined();
  }
  return true;
}

function runToEnd(t: ReturnType<typeof setup>) {
  for (let i = 0; i < 10_000 && t.core.s.game!.phase !== 'gameEnd'; i++) {
    const g = t.core.s.game!;
    if (g.phase === 'roundEnd') {
      for (const id of t.ids) t.send(id, { type: 'ready' });
      continue;
    }
    if (!humanAct(t)) t.advance(2_000);
  }
}

describe('RoomCore', () => {
  it('host is first joiner; needs 3 players to start', () => {
    const t = setup(2, 0);
    expect(t.core.s.hostId).toBe(t.host);
    expect(t.send(t.host, { type: 'start' }).error).toBe('need_players');
    expect(t.send(t.ids[1], { type: 'addBot' }).error).toBe('host_only');
    t.send(t.host, { type: 'addBot' });
    expect(t.send(t.host, { type: 'start' }).error).toBeUndefined();
    expect(t.core.s.stage).toBe('game');
  });

  it('plays a full game with bots and humans', () => {
    const t = setup(2, 3);
    t.send(t.host, { type: 'start' });
    runToEnd(t);
    const g = t.core.s.game!;
    expect(g.phase).toBe('gameEnd');
    expect(g.history).toHaveLength(g.plan.length);
  });

  it('locks the room once a game starts; known devices rejoin their seat', () => {
    const t = setup(3, 0);
    t.send(t.host, { type: 'start' });
    expect(t.core.join('stranger-device-123', 'X', t.now)).toEqual({ ok: false, reason: 'in_progress' });
    t.core.disconnect(t.ids[1], t.now);
    const back = t.core.join('device-1-xxxxxxxx', 'P1', t.now);
    expect(back).toEqual({ ok: true, playerId: t.ids[1] });
  });

  it('pauses after grace, majority vote extends, expiry hands control to host', () => {
    const t = setup(4, 0);
    t.send(t.host, { type: 'start' });
    const victim = t.ids[2];
    t.core.disconnect(victim, t.now);
    t.advance(GRACE_MS - 1_000);
    expect(t.core.s.pause).toBeNull();
    t.advance(1_500);
    expect(t.core.s.pause?.playerId).toBe(victim);
    // Actions are refused while paused.
    const turn = t.core.s.members[t.core.s.game!.round.turn].id;
    if (turn !== victim) expect(t.send(turn, { type: 'bid', bid: 0 }).error).toBe('paused');
    const until = t.core.s.pause!.holdUntil;
    t.send(t.ids[0], { type: 'voteWait' });
    expect(t.core.s.pause!.holdUntil).toBe(until); // 1 of 3 is not a majority
    t.send(t.ids[1], { type: 'voteWait' });
    expect(t.core.s.pause!.holdUntil).toBe(until + 60_000);
    t.advance(121_000);
    expect(t.core.s.pause!.expired).toBe(true);
    // Stays paused until the host acts.
    t.advance(60_000);
    expect(t.core.s.pause!.expired).toBe(true);
    expect(t.send(t.ids[1], { type: 'autoplay', id: victim, on: true }).error).toBe('host_only');
    t.send(t.host, { type: 'autoplay', id: victim, on: true });
    expect(t.core.s.pause).toBeNull();
    // Reconnecting takes the seat back.
    t.core.join('device-2-xxxxxxxx', 'P2', t.now);
    expect(t.core.member(victim)!.autoplay).toBe(false);
  });

  it('host losing connection passes host rights when the hold expires', () => {
    const t = setup(3, 0);
    t.send(t.host, { type: 'start' });
    t.core.disconnect(t.host, t.now);
    t.advance(GRACE_MS + 1_000);
    expect(t.core.s.pause?.playerId).toBe(t.host);
    t.advance(61_000);
    expect(t.core.s.hostId).not.toBe(t.host);
  });

  it('turn timer auto-acts with the lowest legal option', () => {
    const t = setup(3, 0, { timer: 30 });
    t.send(t.host, { type: 'start' });
    const g0 = t.core.s.game!;
    const seat = g0.round.turn;
    t.advance(1); // arm the timer
    expect(t.core.s.turnDeadline).not.toBeNull();
    t.advance(31_500);
    expect(t.core.s.game!.round.bids[seat]).toBe(0);
  });

  it('timer freezes during a pause and resumes with the remaining time', () => {
    const t = setup(3, 0, { timer: 30 });
    t.send(t.host, { type: 'start' });
    t.advance(1);
    const deadline = t.core.s.turnDeadline!;
    const actor = t.core.s.game!.round.turn;
    const other = t.ids[(actor + 1) % 3];
    t.core.disconnect(other, t.now);
    t.advance(GRACE_MS - 1);
    expect(t.core.s.pause).toBeNull();
    t.advance(1);
    expect(t.core.s.pause).not.toBeNull();
    const remaining = t.core.s.turnRemaining!;
    expect(remaining).toBe(deadline - t.now);
    t.advance(20_000);
    t.core.join(`device-${(actor + 1) % 3}-xxxxxxxx`, 'back', t.now);
    t.advance(0);
    expect(t.core.s.turnDeadline).toBe(t.now + remaining);
  });

  it('stops waking up for a host hold when nobody could take over', () => {
    const t = setup(1, 2);
    t.send(t.host, { type: 'start' });
    t.core.disconnect(t.host, t.now);
    t.advance(GRACE_MS);
    expect(t.core.s.pause).not.toBeNull();
    t.advance(HOLD_MS);
    expect(t.core.s.pause!.expired).toBe(true);
    const wake = t.core.nextWake();
    expect(wake === null || wake > t.now).toBe(true);
  });

  it('auto-deals after the round summary countdown', () => {
    const t = setup(1, 2, { start: 1 });
    t.send(t.host, { type: 'setSettings', startCards: 2 });
    t.send(t.host, { type: 'start' });
    for (let i = 0; i < 200 && t.core.s.game!.phase !== 'roundEnd'; i++) if (!humanAct(t)) t.advance(2_000);
    expect(t.core.s.game!.phase).toBe('roundEnd');
    expect(t.core.s.autoDealAt).not.toBeNull();
    t.advance(29_000);
    expect(t.core.s.game!.phase).toBe('roundEnd');
    t.advance(1_000);
    expect(t.core.s.game!.phase).toBe('bidding');
    expect(t.core.s.game!.round.index).toBe(1);
  });

  it('deals 8s after the first Ready', () => {
    const t = setup(2, 1, { start: 2 });
    t.send(t.host, { type: 'start' });
    for (let i = 0; i < 200 && t.core.s.game!.phase !== 'roundEnd'; i++) if (!humanAct(t)) t.advance(2_000);
    t.send(t.ids[1], { type: 'ready' });
    t.advance(7_900);
    expect(t.core.s.game!.phase).toBe('roundEnd');
    t.advance(200);
    expect(t.core.s.game!.phase).toBe('bidding');
  });

  it('rematch returns to lobby and rotates the first dealer', () => {
    const t = setup(1, 2);
    t.send(t.host, { type: 'setSettings', startCards: 1 });
    t.send(t.host, { type: 'start' });
    const first = t.core.s.game!.round.dealer;
    runToEnd(t);
    t.send(t.host, { type: 'rematch' });
    expect(t.core.s.stage).toBe('lobby');
    t.send(t.host, { type: 'start' });
    expect(t.core.s.game!.round.dealer).toBe((first + 1) % 3);
  });

  it('schedules a wake-up as soon as a bot has to act', () => {
    const t = setup(1, 2);
    t.send(t.host, { type: 'start' });
    const g = t.core.s.game!;
    // Whoever acts first, the server must know when to wake up next if it's a bot.
    if (t.core.s.members[g.round.turn].isBot) expect(t.core.nextWake()).not.toBeNull();
    // Play a whole game purely on nextWake() timings: no blind advances.
    for (let i = 0; i < 5000 && t.core.s.game!.phase !== 'gameEnd'; i++) {
      const gg = t.core.s.game!;
      if (gg.phase === 'roundEnd') { t.send(t.host, { type: 'ready' }); }
      if (humanAct(t)) continue;
      const wake = t.core.nextWake();
      expect(wake).not.toBeNull();
      t.advance(Math.max(0, wake! - t.now));
    }
    expect(t.core.s.game!.phase).toBe('gameEnd');
  });

  it('rate-limits reactions', () => {
    const t = setup(3, 0);
    expect(t.send(t.host, { type: 'react', emoji: '🔥' }).reaction).toBeTruthy();
    expect(t.send(t.host, { type: 'react', emoji: '🔥' }).reaction).toBeUndefined();
  });

  it('never leaks other hands or device ids in views', () => {
    const t = setup(3, 0);
    t.send(t.host, { type: 'start' });
    const view = JSON.stringify({ r: t.core.roomView(t.ids[0], t.now), g: t.core.gameView(t.ids[0]) });
    expect(view).not.toContain('device-');
    for (const c of t.core.s.game!.round.hands[1]) expect(view).not.toContain(`"${c}"`);
  });
});
