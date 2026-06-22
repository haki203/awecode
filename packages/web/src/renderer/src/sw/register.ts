// Copyright 2026 Awecode Contributors. Apache-2.0.
export function registerSW(): void {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[awecode] SW registration failed:', err);
    });
  });
}
