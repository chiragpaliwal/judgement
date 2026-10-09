import { create } from 'zustand';
import { load, save } from './storage';

const sysReduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

interface Prefs {
  sound: boolean;
  haptics: boolean;
  reducedMotion: boolean;
  set: (p: Partial<Omit<Prefs, 'set'>>) => void;
}

export const usePrefs = create<Prefs>((set) => ({
  sound: load('jd.sound') !== '0',
  haptics: load('jd.haptics') !== '0',
  reducedMotion: load('jd.reduced') === null ? sysReduced : load('jd.reduced') === '1',
  set: (p) => {
    if (p.sound !== undefined) save('jd.sound', p.sound ? '1' : '0');
    if (p.haptics !== undefined) save('jd.haptics', p.haptics ? '1' : '0');
    if (p.reducedMotion !== undefined) save('jd.reduced', p.reducedMotion ? '1' : '0');
    set(p);
  },
}));
