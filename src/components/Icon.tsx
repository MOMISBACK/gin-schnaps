import React from 'react';
const paths: Record<string, React.ReactNode> = {
  folder: <path d="M2 5h5l2 2h13l-3 12H2V5Zm0 4h18" />,
  save: <><path d="M4 3h13l4 4v14H3V3h1Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/></>,
  circle: <><circle cx="12" cy="12" r="8"/><path d="m13 2 3 3-4 2"/></>,
  linear: <><path d="M3 12h18M3 8v8M21 8v8"/><path d="m10 8 5 4-5 4"/></>,
  sequence: <><path d="M4 5h16M4 12h16M4 19h16M8 3v4M16 10v4M8 17v4"/></>,
  cut: <><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="m8 8 13 13M8 16 21 3"/></>,
  feature: <path d="M3 6h12l6 6-6 6H3V6Z"/>,
  primer: <><path d="M3 7h13l5 5-5 5H9M3 17h2M6 17h1"/><path d="M4 4v6M8 4v6M12 4v6"/></>,
  history: <><path d="M4 4v5h5M4 9a9 9 0 1 1-1 7"/><path d="M12 7v6l4 2"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v7M12 6v1"/></>,
  panel: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
  eyeOff: <><path d="m3 3 18 18M9 5a12 12 0 0 1 13 7 15 15 0 0 1-3 4M6 6a19 19 0 0 0-4 6s4 7 10 7a13 13 0 0 0 5-1"/></>,
  search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/></>,
  close: <path d="m6 6 12 12M6 18 18 6"/>,
  chevron: <path d="m9 5 7 7-7 7"/>,
  plus: <path d="M12 4v16M4 12h16"/>,
  undo: <><path d="m8 4-5 5 5 5M3 9h10a7 7 0 0 1 0 14"/></>,
  redo: <><path d="m16 4 5 5-5 5M21 9H11a7 7 0 0 0 0 14"/></>,
  copy: <><rect x="8" y="8" width="12" height="13" rx="1"/><path d="M16 8V3H3v13h5"/></>,
  check: <path d="m5 12 4 4L19 6"/>,
  warning: <><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 17v1"/></>,
};
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.feature}</svg>;
}
