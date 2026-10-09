import type { Room } from './room';

declare global {
  namespace Cloudflare {
    interface Env {
      Room: DurableObjectNamespace<Room>;
    }
  }
  type Env = Cloudflare.Env;
}
export {};
