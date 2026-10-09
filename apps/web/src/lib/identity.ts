import { NAME_MAX } from '@judgement/engine';
import { load, save } from './storage';

let memoryId: string | null = null;

/** Stable per-device id used to get your seat back after a reconnect. */
export function deviceId(): string {
  const existing = load('jd.device');
  if (existing) return existing;
  const id = memoryId ?? (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36));
  memoryId = id;
  save('jd.device', id);
  return id;
}

export const getName = () => load('jd.name') ?? '';
export const setName = (n: string) => save('jd.name', n.trim().slice(0, NAME_MAX));
