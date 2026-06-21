// Copyright 2026 Awecode Contributors. Apache-2.0.
import { Bonjour } from 'bonjour-service';

export interface MdnsHandle {
  stop(): void;
}

/**
 * Advertise the awecode web server via mDNS so iOS/macOS can use a friendly
 * hostname like `awecode.local`. Best-effort — if publish fails, returns null
 * and the caller continues without mDNS.
 *
 * Android doesn't ship with Bonjour support out of the box, so mDNS is
 * opt-in (default off; enabled via --mdns flag on the CLI).
 */
export async function startMdns(opts: { name: string; port: number }): Promise<MdnsHandle | null> {
  try {
    const bonjour = new Bonjour();
    const service = bonjour.publish({
      name: opts.name,
      type: 'http',
      port: opts.port,
      host: `${opts.name}.local`,
    });
    // Best-effort: 3s startup; if it hasn't published yet, give up gracefully.
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, 3000);
      service.once('up', () => { clearTimeout(t); resolve(); });
    });
    return {
      stop: () => {
        try { service.stop(); } catch {}
        try { bonjour.destroy(); } catch {}
      },
    };
  } catch {
    console.warn('[awecode] mDNS publish failed; continuing without it.');
    return null;
  }
}
