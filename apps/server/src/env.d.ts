import type { Room } from './room';

declare global {
  namespace Cloudflare {
    interface Env {
      Room: DurableObjectNamespace<Room>;
      DB: D1Database;
      /** Secret (wrangler secret put STATS_TOKEN) guarding GET /api/stats. */
      STATS_TOKEN: string;
    }
  }
  type Env = Cloudflare.Env;
}
export {};
