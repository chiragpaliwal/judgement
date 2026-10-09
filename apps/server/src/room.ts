import { Server, type Connection, type ConnectionContext, type WSMessage } from 'partyserver';
import type { GameEvent, ServerMsg } from '@judgement/engine';
import { newRoomState, RoomCore, type RoomState } from './core';
import { parseClientMsg } from './protocol';

/** `seen`: last time this socket proved it was alive (connect, message or fallback ping). */
type ConnState = { playerId: string | null; seen: number };
const ROOM_TTL_MS = 30 * 60_000;
/** Clients ping every 1s on screen and every 10s in the background; a socket silent this long is treated as gone. */
const STALE_MS = 30_000;
/** How often a running game wakes up to look for silent sockets. */
const SWEEP_MS = 10_000;
const PING = 'ping';
const PONG = 'pong';

export class Room extends Server<Env> {
  static override options = { hibernate: true };
  core: RoomCore | null = null;

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
      this.core = new RoomCore(newRoomState(this.name, now));
      await this.commit([]);
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

  override async onClose(conn: Connection<ConnState>) {
    const playerId = conn.state?.playerId;
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
    const anyone = [...this.getConnections()].length > 0;
    if (!anyone && now - this.core.s.lastActivity >= ROOM_TTL_MS) {
      await this.ctx.storage.deleteAll();
      this.core = null;
      return;
    }
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
    const lastSeen = (c: Connection<ConnState>) => {
      const pong = this.ctx.getWebSocketAutoResponseTimestamp(c as unknown as WebSocket)?.getTime() ?? 0;
      return Math.max(pong, c.state?.seen ?? 0);
    };
    const stale = conns.filter((c) => c.state?.playerId && now - lastSeen(c) > STALE_MS);
    let changed = false;
    for (const c of stale) {
      const pid = c.state!.playerId!;
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

  private async commit(events: GameEvent[]) {
    const core = this.core;
    if (!core) return;
    await this.ctx.storage.put('room', core.s);
    const now = Date.now();
    for (const c of this.getConnections<ConnState>()) {
      const pid = c.state?.playerId ?? null;
      if (!pid) continue;
      this.send(c, { type: 'state', room: core.roomView(pid, now), game: core.gameView(pid), events });
    }
    await this.schedule(now);
  }

  private async schedule(now: number) {
    const core = this.core;
    if (!core) return;
    const expiry = core.s.lastActivity + ROOM_TTL_MS;
    const times = [core.nextWake() ?? expiry, expiry];
    if (this.watching()) times.push(now + SWEEP_MS);
    await this.ctx.storage.setAlarm(Math.max(now + 50, Math.min(...times)));
  }
}
