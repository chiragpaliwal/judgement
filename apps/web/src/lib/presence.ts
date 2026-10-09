import { useEffect } from 'react';

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void };
type WakeLockNav = Navigator & { wakeLock?: { request: (type: 'screen') => Promise<Sentinel> } };

/**
 * Keep the screen on while `active`. A phone that auto-locks while waiting on other players
 * leaves the browser just like a phone call does. The browser drops the lock whenever the page
 * is hidden, so take it again on return. Needs a secure context (https or localhost); elsewhere
 * this does nothing.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    const wl = (navigator as WakeLockNav).wakeLock;
    if (!active || !wl) return;
    let lock: Sentinel | null = null;
    let dead = false;
    const acquire = async () => {
      if (dead || lock || document.visibilityState !== 'visible') return;
      try {
        const l = await wl.request('screen');
        if (dead) {
          void l.release();
          return;
        }
        lock = l;
        l.addEventListener('release', () => {
          if (lock === l) lock = null;
        });
      } catch {
        /* low battery mode, permissions policy, … */
      }
    };
    void acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', acquire);
      void lock?.release().catch(() => {});
      lock = null;
    };
  }, [active]);
}

/** Flag the tab title while it's your turn and the page is in the background. */
export function useTurnTitle(myTurn: boolean) {
  useEffect(() => {
    if (!myTurn) return;
    const base = document.title;
    const sync = () => {
      document.title = document.visibilityState === 'hidden' ? `● Your turn · ${base}` : base;
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      document.title = base;
    };
  }, [myTurn]);
}
