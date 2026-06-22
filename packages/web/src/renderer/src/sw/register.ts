// Copyright 2026 Awecode Contributors. Apache-2.0.
import { registerSW as registerPwa } from 'virtual:pwa-register';

/**
 * Register the service worker via vite-plugin-pwa's virtual module so the
 * autoUpdate strategy can drive its controllerchange → reload flow.
 * Returns the unregister callback (unused, but typed for clarity).
 */
export function registerSW(): void {
  registerPwa({ immediate: true });
}
