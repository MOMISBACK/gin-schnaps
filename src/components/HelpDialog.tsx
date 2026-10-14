import React, { useEffect, useRef } from 'react';
import { HelpDetails } from './HelpDetails';

export function HelpDialog({ version, onClose }: { version: string; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);
  return <div className="modal-overlay" onDrop={e => { e.preventDefault(); e.stopPropagation(); }}>
    <div className="edit-dialog help-dialog" ref={box} role="dialog" aria-modal="true" aria-labelledby="help-title"
      onKeyDown={e => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); }
        if ((e.ctrlKey || e.metaKey) && ['n', 'o', 's', 'z', 'q'].includes(e.key.toLowerCase())) {
          e.preventDefault(); e.stopPropagation();
        }
        if (e.key === 'Tab') {
          const nodes = Array.from(box.current!.querySelectorAll<HTMLElement>('button,summary'))
            .filter(node => node.getClientRects().length > 0);
          if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1]?.focus(); }
          else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0]?.focus(); }
        }
      }}>
      <header className="dialog-heading"><h2 id="help-title">Gin Schnaps help</h2><button onClick={onClose}>Close</button></header>
      <div className="dialog-body">
        <p>Gin Schnaps {version} · development preview</p>
        <HelpDetails label="Editing & shortcuts">
          <p>Use ⌘ on macOS, Ctrl elsewhere: A selects all bases, C copies, X or R cuts, V opens Paste, Z undoes, Shift+Z or Y redoes. O opens; S saves.</p>
          <p>Coordinates are 1-based and inclusive. Start &gt; end crosses a circular origin. Double-click a feature to edit it. Base editing uses the Edit bases dialog.</p>
          <p>Shortcuts act on the active document; text fields keep text editing. R is reserved for DNA cut, not reload. Cutting all bases creates an empty working document; native Save and Undo remain available.</p>
          <p>Split shows Sequence and Map side by side. Drag the divider; double-click or press Enter to reset it.</p>
          <p>Paste transfers bases only. Replace removes the selected region; Insert keeps it. Review changed or removed features in the preview.</p>
        </HelpDetails>
        <HelpDetails label="Saving & recovery">
          <p>Desktop: Save writes .sg.json. Browser: Native downloads a file; confirm receipt before closing. Keep independent backups.</p>
          <p>Save PCR setup before saving the document. Recovery does not retain unsaved form entries, calculations or session undo.</p>
          <p>Recovery is optional and unencrypted. Browser recovery depends on the profile and file path.</p>
        </HelpDetails>
        <HelpDetails label="Analysis conventions">
          <p>Calculated results are theoretical, not experimental validation. Parameters and input-specific warnings are shown with the result.</p>
          <p>Translation: genetic codes 1 and 11; * is stop, X is unresolved. Frame translation does not identify a CDS.</p>
          <p>PCR: exact matches on this template, explicit 5′ tails, one template turn. No Tm, dimers or genomic specificity.</p>
          <p>Digest: complete-digest model, 16 enzymes. Methylation, star activity and reaction conditions are not modelled.</p>
        </HelpDetails>
        <HelpDetails label="Privacy & licenses">
          <p>Sequence processing is local. No account, sequence upload or application telemetry.</p>
          <p>Own code: GPL-3.0-or-later. Components retain their licenses; license texts accompany the download. This preview is not laboratory-validated.</p>
        </HelpDetails>
      </div>
    </div>
  </div>;
}
