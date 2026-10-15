import React, { useLayoutEffect, useRef } from 'react';
/** Shared keyboard/focus boundary for annotation operations. */
export function ModalShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  const node = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { const previous = document.activeElement as HTMLElement | null;
    node.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus();
    return () => { if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="edit-dialog annotation-dialog" ref={node} role="dialog" aria-modal="true" aria-label={title} onKeyDown={e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
      if (e.key === 'Tab') {
        const items = Array.from(node.current!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary'));
        if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items[items.length - 1]?.focus(); }
        if (!e.shiftKey && document.activeElement === items[items.length - 1]) { e.preventDefault(); items[0]?.focus(); }
      }
    }}>
      <header className="dialog-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close annotation dialog" onClick={onClose}>×</button></header>{children}
    </div></div>;
}
