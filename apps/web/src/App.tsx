import { useEffect } from 'react';
import { isRoomCode } from '@judgement/engine';
import { usePath, navigate } from './lib/router';
import { usePrefs } from './lib/prefs';
import { Home } from './screens/Home';
import { RoomPage } from './screens/RoomPage';

function parse(path: string): { code: string } | { home: true; redirect: boolean } {
  const m = path.match(/^\/r\/([A-Za-z0-9]+)\/?$/);
  if (m && isRoomCode(m[1].toUpperCase())) return { code: m[1].toUpperCase() };
  return { home: true, redirect: path !== '/' };
}

export function App() {
  const path = usePath();
  const reduced = usePrefs((s) => s.reducedMotion);
  const route = parse(path);

  useEffect(() => {
    document.documentElement.classList.toggle('reduced', reduced);
  }, [reduced]);
  useEffect(() => {
    if ('code' in route && path !== `/r/${route.code}`) navigate(`/r/${route.code}`, true);
    if ('home' in route && route.redirect) navigate('/', true);
  }, [path, route]);

  return 'code' in route ? <RoomPage key={route.code} code={route.code} /> : <Home />;
}
