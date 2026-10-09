// iOS standalone PWAs (black-translucent status bar) report a layout viewport
// that is short by the top safe-area inset, so 100dvh leaves a blank band at
// the bottom. screen.* is reliable there and never rotates on iOS, so derive
// the real height from it. Everywhere else (Android, browsers) 100dvh is right.
export function fitViewport() {
  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = nav.standalone === true || matchMedia('(display-mode: standalone)').matches;
  // iPhone only: a standalone app there always fills the screen (no split view).
  if (!standalone || !/iP(hone|od)/.test(navigator.userAgent)) return;
  const root = document.documentElement;
  const apply = () => {
    const portrait = matchMedia('(orientation: portrait)').matches;
    const { width, height } = screen;
    const h = portrait ? Math.max(width, height) : Math.min(width, height);
    root.style.setProperty('--app-h', `${h}px`);
  };
  apply();
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', apply);
}
