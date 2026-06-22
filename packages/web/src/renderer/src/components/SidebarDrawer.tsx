// Copyright 2026 Awecode Contributors. Apache-2.0.
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function SidebarDrawer({ open, onClose, children }: Props) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <div className={`sidebar-drawer ${open ? 'open' : ''}`}>{children}</div>
    </>
  );
}
