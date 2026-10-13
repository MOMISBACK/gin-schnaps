import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type CommandResult } from '../domain/commands';
import { createDocument, newDocumentId } from '../domain/document-operations';
import { type Selection, type SequenceDocument, serializeDocument, toUserRange } from '../domain/model';
import { MAX_PASTE_CHARACTERS, parsePastedDNA, pasteIntoDocument } from '../domain/sequence-paste';
import { Icon } from './Icon';
import { HelpDetails } from './HelpDetails';

export type CopiedDNA = { sequence: string; sourceName: string };
export function PasteDialog({ doc, selection, initialText, copied, canCreate, onClose, onApply, onCreate }: {
  doc?: SequenceDocument; selection: Selection; initialText: string; copied: CopiedDNA | null; canCreate: boolean;
  onClose: () => void; onApply: (result: CommandResult) => void; onCreate: (doc: SequenceDocument) => void;
}) {
  const range = doc ? toUserRange(selection, doc.sequence.length) : null;
  const [mode, setMode] = useState<'insert' | 'replace' | 'new'>(!doc ? 'new' : selection ? 'replace' : 'insert');
  const [text, setText] = useState(initialText.length <= MAX_PASTE_CHARACTERS ? initialText : '');
  const [inputError, setInputError] = useState(initialText.length > MAX_PASTE_CHARACTERS ? 'Clipboard text exceeds 400,000 characters.' : '');
  const [start, setStart] = useState(String(range?.start ?? 1));
  const [end, setEnd] = useState(String(range?.end ?? 1));
  const [reverse, setReverse] = useState(false);
  const [name, setName] = useState('Pasted sequence');
  const [topology, setTopology] = useState<'linear' | 'circular'>('linear');
  const [reading, setReading] = useState(false);
  const [clipboardNotice, setClipboardNotice] = useState('');
  const container = useRef<HTMLDivElement>(null), input = useRef<HTMLTextAreaElement>(null);
  const identity = useRef(newDocumentId()), inputRevision = useRef(0), mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => { mounted.current = false; if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, []);
  const setDNA = (value: string) => {
    inputRevision.current++;
    if (value.length > MAX_PASTE_CHARACTERS) { setInputError('Clipboard text exceeds 400,000 characters. Nothing was pasted; open a sequence file instead.'); return; }
    setInputError(''); setText(value);
  };
  const readClipboard = async () => {
    const revision = inputRevision.current;
    setReading(true); setClipboardNotice('');
    try {
      if (!navigator.clipboard?.readText) throw new Error('Unavailable');
      const value = await navigator.clipboard.readText();
      if (!mounted.current) return;
      if (revision !== inputRevision.current) { setClipboardNotice('Clipboard result ignored because you edited the text while it was being read.'); return; }
      setDNA(value);
    } catch {
      if (mounted.current) setClipboardNotice('Clipboard reading is unavailable or denied. Click the DNA box and press ⌘/Ctrl V, or explicitly use the last copied DNA.');
    } finally { if (mounted.current) { setReading(false); input.current?.focus(); } }
  };
  const preview = useMemo((): { result?: CommandResult; created?: SequenceDocument; length?: number; warnings: string[]; error?: string } => {
    try {
      if (inputError) throw new Error(inputError);
      const parsed = parsePastedDNA(text, reverse);
      if (mode === 'new') {
        if (!canCreate) throw new Error('Maximum open documents reached. Close a document first.');
        const created = createDocument({ name, description: 'Created from pasted base sequence only; no source annotations transferred.', sequence: parsed.sequence, topology }, identity.current);
        serializeDocument(created);
        return { created, length: parsed.sequence.length, warnings: ['A separate document will be created; existing files are unchanged.', ...parsed.notices] };
      }
      if (!doc) throw new Error('No destination document. Create a new document instead.');
      const result = pasteIntoDocument(doc, text, { mode, start: Number(start), end: Number(end) }, reverse);
      return { result, length: parsed.sequence.length, warnings: result.warnings };
    } catch (error) { return { warnings: [], error: (error as Error).message }; }
  }, [doc, text, inputError, mode, start, end, reverse, name, topology, canCreate]);
  const changed = !!preview.created || (!!preview.result && preview.result.doc !== doc);
  return <div className="modal-overlay" onDrop={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div ref={container} className="edit-dialog paste-dialog" role="dialog" aria-modal="true" aria-labelledby="paste-title"
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') {
          const nodes = Array.from(container.current!.querySelectorAll<HTMLElement>('input:not(:disabled),textarea:not(:disabled),select:not(:disabled),button:not(:disabled),summary'));
          const first = nodes[0], last = nodes[nodes.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
      <header className="dialog-heading"><div><Icon name="copy"/><h2 id="paste-title">Paste DNA</h2></div><button className="icon-button" aria-label="Close paste without applying" onClick={onClose}><Icon name="close"/></button></header>
      <form onSubmit={event => { event.preventDefault(); if (!changed) return; if (preview.created) onCreate(preview.created); else if (preview.result) onApply(preview.result); }}>
        <div className="dialog-body">
          <p className="dialog-context">{doc ? `Destination: ${doc.name} · ${doc.sequence.length.toLocaleString('en-US')} bp · ${doc.topology}` : 'No document open — create one from the clipboard.'}</p>
          <label className="form-row">DNA to paste, 5′→3′<textarea ref={input} className="dna-input" aria-label="DNA to paste" spellCheck={false} rows={3} value={text} onChange={event => setDNA(event.target.value)}
            onPaste={event => {
              // One explicit replacement avoids native/controlled-input divergence
              // and rejects the entire over-limit paste, rather than truncating it.
              event.preventDefault();
              const box = event.currentTarget, incoming = event.clipboardData.getData('text/plain');
              const before = box.selectionStart, after = box.selectionEnd;
              const next = box.value.slice(0, before) + incoming + box.value.slice(after);
              setDNA(next);
              if (next.length <= MAX_PASTE_CHARACTERS) requestAnimationFrame(() => {
                if (box.isConnected) box.setSelectionRange(before + incoming.length, before + incoming.length);
              });
            }}/></label>
          <div className="paste-actions"><button type="button" disabled={reading} onClick={() => void readClipboard()}>{reading ? 'Reading…' : 'Read clipboard'}</button>
            {copied && <button type="button" title={`${copied.sequence.length} bases from ${copied.sourceName}; session memory only`} onClick={() => { setDNA(copied.sequence); setClipboardNotice(`Using ${copied.sequence.length.toLocaleString('en-US')} bases last copied from ${copied.sourceName}; not a fresh system clipboard read.`); input.current?.focus(); }}>Use last copied DNA</button>}
            <span className="field-note">DNA or single-record FASTA</span></div>
          {clipboardNotice && <p className="field-note" role="status">{clipboardNotice}</p>}
          <label className="analysis-check"><input type="checkbox" checked={reverse} onChange={event => setReverse(event.target.checked)}/>Reverse-complement pasted DNA</label>
          <label className="form-row">Operation<select aria-label="Paste operation" value={mode} onChange={event => setMode(event.target.value as typeof mode)}>
            {doc && <><option value="insert">Insert before a base</option><option value="replace">Replace a region</option></>}
            <option value="new">Create a new document</option>
          </select></label>
          {mode === 'new' ? <div className="form-columns"><label className="form-row">Name<input aria-label="Pasted document name" value={name} maxLength={200} onChange={event => setName(event.target.value)}/></label><label className="form-row">Topology<select aria-label="Pasted document topology" value={topology} onChange={event => setTopology(event.target.value as typeof topology)}><option value="linear">Linear</option><option value="circular">Circular</option></select></label></div> : <>
            <div className="form-columns"><label className="form-row">{mode === 'insert' ? 'Before base' : 'Start'}<input aria-label="Paste start" value={start} inputMode="numeric" onChange={event => setStart(event.target.value)}/></label>
              {mode === 'replace' && <label className="form-row">End<input aria-label="Paste end" value={end} inputMode="numeric" onChange={event => setEnd(event.target.value)}/></label>}
              {mode === 'insert' && <button type="button" onClick={() => setStart(String(doc!.sequence.length + 1))}>Append at end</button>}
            </div><HelpDetails label="Paste details"><p>1-based, inclusive. Insert at {doc!.sequence.length + 1} to append. Start &gt; end replaces across a circular origin.</p><p>Bases only; source features and oligos are not transferred. Destination features follow the editing rules shown in the preview.</p></HelpDetails>
          </>}
          <section className="edit-preview" aria-label="Paste preview"><h3>Preview</h3>
            {preview.error ? <p className="validation-error" role="status">{preview.error}</p> : <><p><strong>{preview.length?.toLocaleString('en-US')} pasted bases</strong>{preview.result ? ` · ${doc!.sequence.length.toLocaleString('en-US')} → ${preview.result.doc.sequence.length.toLocaleString('en-US')} bp · ${preview.result.changed} feature(s) adjusted · ${preview.result.removed} removed` : ' · source annotations are not transferred'}</p>
              {!changed && <p>No sequence change.</p>}{preview.warnings.map((warning, i) => <p className="preview-warning" key={i}>{warning}</p>)}</>}
          </section>
        </div>
        <footer className="dialog-footer"><button type="button" onClick={onClose}>Cancel</button><button type="submit" className="primary-button" disabled={!changed || reading}>{mode === 'new' ? 'Create document' : 'Apply paste'}</button></footer>
      </form>
    </div>
  </div>;
}
