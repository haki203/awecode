// Copyright 2026 Awecode Contributors. Apache-2.0.
import { useCallback, useState } from 'react';

export interface UseNotifications {
  permission: NotificationPermission;
  isStandalone: boolean;
  requestPermission: () => Promise<void>;
  notifyDone: () => void;
}

export function useNotifications(): UseNotifications {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const isStandalone =
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as any).standalone === true);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPermission(p);
  }, []);

  const notifyDone = useCallback(() => {
    if (permission !== 'granted') return;
    try { new Notification('Awecode', { body: 'Agent đã xong', tag: 'done' }); } catch {}
  }, [permission]);

  return { permission, isStandalone, requestPermission, notifyDone };
}
