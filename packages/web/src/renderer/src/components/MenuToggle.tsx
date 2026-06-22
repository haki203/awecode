// Copyright 2026 Awecode Contributors. Apache-2.0.
interface Props {
  open: boolean;
  onClick: () => void;
}

export function MenuToggle({ open, onClick }: Props) {
  return (
    <button className="menu-toggle" onClick={onClick} aria-label={open ? 'Close menu' : 'Open menu'}>
      {open ? '✕' : '☰'}
    </button>
  );
}
