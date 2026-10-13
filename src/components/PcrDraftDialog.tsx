import React, { useEffect, useRef, useState } from 'react';

export function PcrDraftDialog({ name, validationError, onKeep, onDiscard, onSave }: {
  name: string; validationError: string | null; onKeep: () => void; onDiscard: () => void; onSave: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="pcr-draft-title" ref={box}
      onKeyDown={e => {
        if (e.key === 'Escape') { e.stopPropagation(); onKeep(); }
        if (e.key === 'Tab') {
          const buttons = Array.from(box.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
          if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[buttons.length - 1]?.focus(); }
          else if (!e.shiftKey && document.activeElement === buttons[buttons.length - 1]) { e.preventDefault(); buttons[0]?.focus(); }
        }
        if ((e.metaKey || e.ctrlKey) && ['s', 'o', 'n', 'z', 'q'].includes(e.key.toLowerCase())) { e.preventDefault(); e.stopPropagation(); }
      }}>
      <header className="dialog-heading"><h2 id="pcr-draft-title">Unsaved PCR draft</h2></header>
      <div className="dialog-body"><p>“{name}” contains PCR form changes that are not stored in its document.</p>
        <p>Keep working to review them. Save PCR setup stores valid fields in the document and keeps the tab open; save or export the document afterwards. Discard draft and close explicitly abandons these form changes.</p>
        {(validationError || error) && <p role="alert" className="validation-error">{validationError || error}</p>}
      </div>
      <footer className="dialog-footer"><button onClick={onKeep}>Keep working</button>
        <button onClick={onDiscard}>Discard draft and close</button>
        <button className="primary-button" disabled={!!validationError} onClick={() => { try { onSave(); } catch (e) { setError((e as Error).message); } }}>Save PCR setup</button>
      </footer>
    </div>
  </div>;
}
