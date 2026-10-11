import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import type { GameEvent, ServerMsg } from '@judgement/engine';
import { idleExpired, newRoomState, nextAlarm, ROOM_TTL_MS, RoomCore, STALE_MS, type RoomState } from './core';
import { parseClientMsg } from './protocol';
import { gameEnded, gameStarted, log, roomCreated } from './metrics';

/** `seen`: last time this socket proved it was alive (connect, message or fallback ping). */
type ConnState = { playerId: string | null; seen: number };
/** More alarm runs than this in a minute means something keeps re-arming for nothing: back off. */
const STORM_WINDOW_MS = 60_000;
const STORM_MAX = 120;
const STORM_BACKOFF_MS = 30_000;
const PING = 'ping';
const PONG = 'pong';

export class Room extends Server<Env> {
  static override options = { hibernate: true };
  core: RoomCore | null = null;
  /** When recent alarms ran, for the storm breaker. In memory only: resets on eviction, which is fine. */
  private alarmRuns: number[] = [];

  override async onStart() {
    // Heartbeat: answered by the runtime without waking the hibernated room.
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    const s = await this.ctx.storage.get<RoomState>('room');
    this.core = s ? new RoomCore(s) : null;
  }

  override async onRequest(req: Request): Promise<Response> {
    const now = Date.now();
    if (req.method === 'POST') {
      const live = this.core && this.core.s.members.length > 0 && now - this.core.s.lastActivity < ROOM_TTL_MS;
      if (live) return new Response('taken', { status: 409 });
      this.abandonIfRunning(now);
      this.core = new RoomCore(newRoomState(this.name, now));
      await this.commit([]);
      this.ctx.waitUntil(roomCreated(this.env.DB, this.name, now, req.headers.get('x-country')));
      return Response.json({ code: this.name });
    }
    if (!this.core) return Response.json({ exists: false }, { status: 404 });
    return Response.json({
      exists: true,
      stage: this.core.s.stage,
      players: this.core.s.members.length,
    });
  }

  override async onConnect(conn: Connection<ConnState>, ctx: ConnectionContext) {
    const url = new URL(ctx.request.url);
    const deviceId = url.searchParams.get('deviceId') ?? '';
    const name = url.searchParams.get('name') ?? '';
    log('connect', {
      room: this.name,
      conn: conn.id,
      // Sent by the client: why it (re)connected, how many times this page has, and the last state it saw.
      reason: url.searchParams.get('reason'),
      attempt: url.searchParams.get('attempt'),
      since: url.searchParams.get('since'),
      seq: this.core?.s.seq ?? null,
      colo: (ctx.request.cf as { colo?: string } | undefined)?.colo ?? null,
    });
    conn.setState({ playerId: null, seen: Date.now() });
    if (!this.core) {
      this.send(conn, { type: 'no_room' });
      conn.close(4004, 'no_room');
      return;
    }
    if (deviceId.length < 8 || deviceId.length > 64) {
      this.send(conn, { type: 'error', code: 'bad_device' });
      conn.close(4000, 'bad_device');
      return;
    }
    const now = Date.now();
    const res = this.core.join(deviceId, name, now);
    if (!res.ok) {
      this.send(conn, { type: 'locked', reason: res.reason });
      conn.close(4003, res.reason);
      return;
    }
    for (const c of this.getConnections<ConnState>()) {
      if (c.id !== conn.id && c.state?.playerId === res.playerId) {
        c.setState({ playerId: null, seen: c.state?.seen ?? now });
        this.send(c, { type: 'replaced' });
        c.close(4001, 'replaced');
      }
    }
    conn.setState({ playerId: res.playerId, seen: now });
    await this.commit(this.core.tick(now));
  }

  override async onMessage(conn: Connection<ConnState>, raw: WSMessage) {
    const playerId = conn.state?.playerId ?? null;
    conn.setState({ playerId, seen: Date.now() });
    if (raw === PING) {
      this.send(conn, PONG);
      return;
    }
    if (!playerId || !this.core) return;
    const msg = parseClientMsg(raw);
    if (!msg) {
      this.send(conn, { type: 'error', code: 'bad_message' });
      return;
    }
    const out = this.core.handle(playerId, msg, Date.now());
    if (out.error && out.error !== 'slow_down') this.send(conn, { type: 'error', code: out.error });
    if (out.reaction) this.broadcastMsg({ type: 'reaction', ...out.reaction });
    if (out.removed?.length) {
      for (const c of this.getConnections<ConnState>()) {
        if (c.state?.playerId && out.removed.includes(c.state.playerId)) {
          c.setState({ playerId: null, seen: c.state?.seen ?? Date.now() });
          this.send(c, { type: 'error', code: msg.type === 'leave' ? 'left' : 'removed' });
          c.close(4002, 'removed');
        }
      }
    }
    if (out.changed) await this.commit(out.events);
  }

  override async onClose(conn: Connection<ConnState>, code: number, reason: string) {
    const playerId = conn.state?.playerId;
    log('close', { room: this.name, conn: conn.id, player: playerId ?? null, code, reason, quietMs: Date.now() - this.lastSeen(conn) });
    if (!playerId || !this.core) return;
    const stillHere = [...this.getConnections<ConnState>()].some(
      (c) => c.id !== conn.id && c.state?.playerId === playerId,
    );
    if (stillHere) return;
    const now = Date.now();
    this.core.disconnect(playerId, now);
    await this.commit(this.core.tick(now));
  }

  override async onAlarm() {
    if (!this.core) return;
    const now = Date.now();
    this.alarmRuns = this.alarmRuns.filter((t) => now - t < STORM_WINDOW_MS);
    this.alarmRuns.push(now);
    const conns = [...this.getConnections()];
    if (now - this.core.s.lastActivity >= ROOM_TTL_MS && (conns.length === 0 || idleExpired(this.core.s, now))) {
      // A tab left open on the lobby or results screen keeps pinging but must not keep the room alive.
      for (const c of conns) {
        this.send(c, { type: 'no_room' });
        try {
          c.close(4004, 'no_room');
        } catch {
          /* already closed */
        }
      }
      this.abandonIfRunning(this.core.s.lastActivity);
      await this.ctx.storage.deleteAll();
      this.core = null;
      return;
    }
    // How late the alarm ran relative to what it was set for (bot move, deal, grace…).
    const due = this.core.nextWake();
    if (due !== null && now - due > 250) log('alarm_late', { room: this.name, lateMs: now - due });
    const before = JSON.stringify(this.core.s);
    const swept = this.sweep(now);
    const events = this.core.tick(now);
    if (swept || events.length || JSON.stringify(this.core.s) !== before) await this.commit(events);
    else await this.schedule(now);
  }

  /**
   * A phone that is backgrounded (call, app switch, lock screen) or drops off the network can
   * leave its socket half-open: no close ever arrives, so the player looks connected and the
   * table waits on them forever. Treat sockets that have stopped pinging as disconnected so the
   * usual grace → pause → hold flow kicks in. If the client is in fact alive it reconnects.
   */
  private sweep(now: number): boolean {
    const core = this.core;
    if (!core || !this.watching()) return false;
    const conns = [...this.getConnections<ConnState>()];
    const stale = conns.filter((c) => c.state?.playerId && now - this.lastSeen(c) >= STALE_MS);
    let changed = false;
    for (const c of stale) {
      const pid = c.state!.playerId!;
      log('sweep', { room: this.name, conn: c.id, player: pid, quietMs: now - this.lastSeen(c), autoPong: this.autoPongAt(c) });
      c.setState({ playerId: null, seen: c.state!.seen });
      try {
        c.close(4100, 'stale');
      } catch {
        /* already closed */
      }
      const stillHere = conns.some((o) => o.state?.playerId === pid);
      if (!stillHere && core.member(pid)?.connected) {
        core.disconnect(pid, now);
        changed = true;
      }
    }
    return changed;
  }

  /** Last time the runtime answered a ping on this socket for us, or null if it never has. */
  private autoPongAt(c: Connection): number | null {
    try {
      return this.ctx.getWebSocketAutoResponseTimestamp(c as unknown as WebSocket)?.getTime() ?? null;
    } catch {
      return null;
    }
  }

  /** Last sign of life on a socket: an auto-answered ping, or anything that reached onMessage. */
  private lastSeen(c: Connection<ConnState>): number {
    return Math.max(this.autoPongAt(c) ?? 0, c.state?.seen ?? 0);
  }

  /** When the quietest player socket would go stale, if a running game is being watched. */
  private sweepAt(): number | null {
    if (!this.watching()) return null;
    const seen = [...this.getConnections<ConnState>()].filter((c) => c.state?.playerId).map((c) => this.lastSeen(c));
    return Math.min(...seen) + STALE_MS;
  }

  /** Whether a running game needs its sockets checked for liveness. */
  private watching(): boolean {
    const s = this.core?.s;
    if (!s || s.stage !== 'game' || s.game?.phase === 'gameEnd') return false;
    return [...this.getConnections<ConnState>()].some((c) => c.state?.playerId);
  }

  private send(conn: Connection, msg: ServerMsg | typeof PONG) {
    try {
      conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
    } catch {
      /* socket already closed */
    }
  }

  private broadcastMsg(msg: ServerMsg) {
    this.broadcast(JSON.stringify(msg));
  }

  /** Records a game that is being discarded (room expired or its code reused) before it reached gameEnd. */
  private abandonIfRunning(at: number) {
    const s = this.core?.s;
    if (s && s.stage === 'game' && s.game && s.game.phase !== 'gameEnd') {
      this.ctx.waitUntil(gameEnded(this.env.DB, s, 'abandoned', at));
    }
  }

  private async commit(events: GameEvent[]) {
    const core = this.core;
    if (!core) return;
    const seq = (core.s.seq = (core.s.seq ?? 0) + 1);
    await this.ctx.storage.put('room', core.s);
    for (const e of events) {
      if (e.type === 'dealt' && e.round === 0) this.ctx.waitUntil(gameStarted(this.env.DB, core.s));
      else if (e.type === 'gameOver') {
        this.ctx.waitUntil(gameEnded(this.env.DB, core.s, core.s.endedEarly ? 'ended_early' : 'completed', Date.now()));
      }
    }
    const now = Date.now();
    for (const c of this.getConnections<ConnState>()) {
      const pid = c.state?.playerId ?? null;
      if (!pid) continue;
      this.send(c, { type: 'state', seq, room: core.roomView(pid, now), game: core.gameView(pid), events });
    }
    await this.schedule(now);
  }

  private async schedule(now: number) {
    const core = this.core;
    if (!core) return;
    const wake = core.nextWake();
    // Always right after a tick, so a past wake is work tick() could not do.
    if (wake !== null && wake <= now) log('wake_stuck', { room: this.name, lateMs: now - wake });
    let at = nextAlarm(now, wake, core.s.lastActivity, this.sweepAt());
    if (this.alarmRuns.length > STORM_MAX) {
      log('alarm_storm', { room: this.name, count: this.alarmRuns.length });
      at = Math.max(at, now + STORM_BACKOFF_MS);
    }
    await this.ctx.storage.setAlarm(at);
  }
}
