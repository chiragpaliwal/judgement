import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { usePrefs } from './lib/prefs';
import { fitViewport } from './lib/viewport';
import './styles.css';

registerSW({ immediate: true });
fitViewport();

function Root() {
  const reduced = usePrefs((s) => s.reducedMotion);
  return (
    <MotionConfig reducedMotion={reduced ? 'always' : 'user'}>
      <App />
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
