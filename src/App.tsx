import { MAX_PASTE_CHARACTERS } from './domain/sequence-paste';
import { flushSync } from 'react-dom';
import { PasteDialog, type CopiedDNA } from './components/PasteDialog';
import { hasSelectedText, isTextEntry, writeClipboardText } from './adapters/clipboard';
import { PcrDraftDialog } from './components/PcrDraftDialog';
import { hasPcrDraft, pcrDraftError } from './domain/pcr-drafts';
import { executeCommand } from './domain/commands';
import { newDocumentId } from './domain/document-operations';
import { isDesktop, nativeCall, bytesFromBase64, requestExport, exportBlob, type NativeFile, type NativeSave, type FileBinding } from './adapters/desktop';
import { NativeQuitDialog } from './components/NativeQuitDialog';
import { recipeOptions } from './domain/primers';
import { DocumentDialog, type DocumentMode } from './components/DocumentDialog';
import { SearchPanel, DEFAULT_SEARCH } from './components/SearchPanel';
import { type SearchOptions } from './core/search';
import { reverseComplement } from './core/dna';
import { ExportDialog } from './components/ExportDialog';
import { RecoveryPanel } from './components/RecoveryPanel';
import { base64ToBytes } from './formats/dna-packets';
import React, { useEffect, useReducer, useRef, useState } from 'react';
import { TranslationPanel } from './components/analysis/TranslationPanel';
import { RestrictionPanel } from './components/analysis/RestrictionPanel';
import { PcrPanel, EMPTY_PCR } from './components/analysis/PcrPanel';
import { type PcrOptions } from './core/pcr';
import { EditDialog, type EditMode } from './components/EditDialog';
import { type CommandResult } from './domain/commands';
import { createDemo } from './domain/demo';
import { importLocalFile } from './domain/files';
import { featureSelection, formatLocation, MAX_OPEN_DOCUMENTS, selectedSequence, serializeDocument, toUserRange, type Selection, type SequenceDocument } from './domain/model';
import { emptyWorkspace, needsExport, panelLayout, workspaceReducer, type View, type OpenDocument } from './domain/workspace';
import { Icon } from './components/Icon';
import { MapView } from './components/MapView';
import { SequenceView } from './components/SequenceView';
import { SelectionBar } from './components/SelectionBar';
import { Minimap } from './components/Minimap';
import { useWindowWidth } from './components/hooks';
const VIEWS: { id: View; label: string; icon: string }[] = [
  { id: 'map', label: "Map", icon: 'circle' }, { id: 'sequence', label: "Sequence", icon: 'sequence' },
  { id: 'translation', label: "Translation", icon: 'sequence' },
  { id: 'enzymes', label: 'Enzymes', icon: 'cut' }, { id: 'features', label: "Features", icon: 'feature' },
  { id: 'primers', label: "Primers", icon: 'primer' }, { id: 'history', label: "History", icon: 'history' }
];
const number = (value: number) => value.toLocaleString("en-US");
function storedExplorer(): boolean {
  try { const saved = localStorage.getItem('gin-schnaps.explorer'); return saved === null ? window.innerWidth >= 1180 : saved === 'true'; }
  catch { return window.innerWidth >= 1180; }
}
function Tool({ icon, children, onClick, disabled = false, title, active }: {
  icon: string; children?: React.ReactNode; onClick?: () => void; disabled?: boolean; title: string; active?: boolean;
}) {
  return <button className={`tool ${children ? 'with-label' : ''} ${active ? 'active' : ''}`} onClick={onClick}
    disabled={disabled} title={title} aria-label={title} aria-pressed={active}><Icon name={icon}/>{children && <span>{children}</span>}</button>;
}
function FeatureTable({ entry, select, toggle, edit }: { entry: OpenDocument; select: (s: Selection) => void; toggle: (id: string) => void; edit: (id?: string) => void }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const features = entry.doc.features.filter(f => f.name.toLowerCase().includes(query.toLowerCase()));
  return <div className="table-view">
    <div className="table-toolbar"><strong>{entry.doc.features.length} annotations</strong><span className="flex-spacer"/>
      <label className="search-field"><Icon name="search"/><input aria-label="Filter features" placeholder="Filter features" value={query} onChange={e => setQuery(e.target.value)}/></label>
      <button onClick={() => edit()}>Add…</button></div>
    <div className="table-scroll"><table><thead><tr><th aria-label="Details"/><th aria-label="Visibility"/><th>Name</th><th>Location</th><th>Length</th><th>Strand</th><th>Type</th><th>Editing</th></tr></thead>
      <tbody>{features.map(feature => {
        const selection = featureSelection(feature, entry.doc);
        const active = !!selection && entry.selection?.start === selection.start && entry.selection?.length === selection.length;
        return <React.Fragment key={feature.id}><tr className={active ? 'selected-row' : ''}>
          <td><button className={`icon-button ${expanded === feature.id ? 'expanded' : ''}`} aria-label={`Details of ${feature.name}`} aria-expanded={expanded === feature.id} onClick={() => setExpanded(expanded === feature.id ? null : feature.id)}><Icon name="chevron"/></button></td>
          <td><button className="icon-button" aria-label={`${entry.hiddenFeatures.includes(feature.id) ? "Show" : "Hide"} ${feature.name}`} aria-pressed={!entry.hiddenFeatures.includes(feature.id)} onClick={() => toggle(feature.id)}><Icon name={entry.hiddenFeatures.includes(feature.id) ? 'eyeOff' : 'eye'}/></button></td>
          <td><button className="feature-name" onClick={() => { if(selection)select(selection);else setExpanded(feature.id); }}><span className="color-swatch" style={{ background: feature.color }}/>{feature.name}</button></td>
          <td className="numeric">{formatLocation(feature)}</td><td className="numeric">{feature.unresolved ? 'Unresolved' : `${number(feature.segments.reduce((n,s)=>n+s.end-s.start,0))} bp`}</td><td>{feature.unresolved ? 'See descriptor' : feature.strand === 1 ? '→ (+)' : feature.strand === -1 ? '← (−)' : '—'}</td><td>{feature.type}{feature.reviewRequired && <span className="review-badge">Needs review</span>}</td><td><button className="small-button" aria-label={`Edit ${feature.name}`} onClick={() => edit(feature.id)}>Edit…</button></td>
        </tr>{expanded === feature.id && <tr className="detail-row"><td colSpan={8}>{feature.unresolved ? <p className="analysis-warning">{feature.unresolved.reason} Descriptor preserved; not projected on the map and not translated.</p> : !selection && <div><p>Disjoint feature: choose an individual part. The intervening bases are not part of this feature.</p>{feature.segments.map((s,i)=><button key={i} onClick={()=>select({start:s.start,length:s.end-s.start})}>Part {i+1}: {s.start+1}..{s.end}</button>)}</div>}<p>Identifier: {feature.id} · Internal location: {feature.segments.map(s => `[${s.start}, ${s.end})`).join(' + ')}</p>
              {feature.qualifiers.map((q, i) => <p className="qualifier-value" key={i}><code>/{q.key}</code>{q.value !== null && <> = {q.value}</>}{q.key === 'translation' && <strong> — declared value, not recalculated</strong>}</p>)}
              {!!feature.archivedQualifiers.length && <div className="archived-qualifiers"><strong>Archived values — do not use as current results</strong>{feature.archivedQualifiers.map((q, i) => <p key={i}><code>/{q.key}</code> = {q.value} · {q.reason}</p>)}</div>}
            </td></tr>}</React.Fragment>;
      })}</tbody></table>{!features.length && <p className="empty-message">No features to display.</p>}</div>
  </div>;
}
function InfoPanel({ entry, close, editTopology }: { entry: OpenDocument; close: () => void; editTopology: () => void }) {
  const range = toUserRange(entry.selection, entry.doc.sequence.length);
  const selectedFeature = entry.doc.features.find(f => { const s = featureSelection(f, entry.doc); return s?.start === entry.selection?.start && s?.length === entry.selection?.length; });
  return <aside className="info-panel" aria-label="Document information">
    <div className="panel-heading"><strong>Information</strong><button className="icon-button" onClick={close} aria-label="Close information"><Icon name="close"/></button></div>
    <div className="info-body"><div className="info-document-icon"><Icon name={entry.doc.topology === 'circular' ? 'circle' : 'linear'} size={28}/></div>
      <h2>{entry.doc.name}</h2><p className="muted">{number(entry.doc.sequence.length)} bp · DNA {entry.doc.topology === 'circular' ? "circular" : "linear"}</p>
      <h3>Document</h3><dl><dt>Source</dt><dd>{entry.source}</dd><dt>Features</dt><dd>{entry.doc.features.length}</dd><dt>State</dt><dd>{needsExport(entry) ? "Modified, not exported" : "Same as the last import or confirmed export"}</dd></dl>
      <button className="small-button" onClick={editTopology}>Set topology…</button>
      <h3>Description</h3><p className="description">{entry.doc.description || "No description."}</p>
      <h3>Selection</h3>{range ? <><p className="numeric">{number(range.start)} → {number(range.end)} · {number(entry.selection!.length)} bp</p>{selectedFeature && <p><span className="color-swatch" style={{ background: selectedFeature.color }}/>{selectedFeature.name}</p>}
        {range.end < range.start && <p className="origin-note">The selection crosses the origin.</p>}</> : <p className="muted">No region selected.</p>}
      {entry.doc.sourceArchive && <><h3>Source {entry.doc.sourceArchive.format === 'genbank' ? 'GenBank' : '.dna'} original</h3><p>{entry.doc.sourceArchive.filename}</p><p className="origin-note">{entry.doc.sourceArchive.superseded ? "Archive predates the edits: this is not the current document." : "Original source preserved; not all metadata are interpreted."}</p><button className="small-button" onClick={() => downloadFile(entry.doc.sourceArchive!.format === 'genbank' ? "ORIGINAL_SOURCE.gb" : "ORIGINAL_SOURCE.dna", entry.doc.sourceArchive!.format === 'genbank' ? entry.doc.sourceArchive!.text : base64ToBytes(entry.doc.sourceArchive!.base64), 'application/octet-stream')}>Export original source</button>{entry.doc.sourceArchive.format === 'snapgene' && <details className="import-report" open><summary>.dna import report</summary>{entry.doc.sourceArchive.report.map((r, i) => <div key={i}><strong>{r.label} · {r.bytes} bytes</strong><span className={r.status === 'archived' ? 'archive-status' : 'import-status'}>{r.status === 'archived' ? "Archive only" : "Interpreted (see limitations)"}</span><p>{r.detail}</p></div>)}</details>}</>}
      <h3>Privacy</h3><p className="muted">{isDesktop()?'Processed locally in this application.':'Processed in your browser.'} No account, sequence upload or remote saving.</p>
    </div>
  </aside>;
}
function EmptyView({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return <div className="empty-view"><Icon name={icon} size={34}/><h2>{title}</h2><p>{children}</p></div>;
}
function downloadFile(name:string,content:string|Uint8Array,mime='application/json;charset=utf-8'){
  requestExport(name,content,mime);
}
export default function App() {
  const [workspace, dispatch] = useReducer(workspaceReducer, undefined, () => workspaceReducer(emptyWorkspace, { type: 'open', documents: [createDemo()], source: "Built-in synthetic example" }));
  const [copiedDNA, setCopiedDNA] = useState<CopiedDNA | null>(null);
  const [pasteDialog, setPasteDialog] = useState<{ key: number | null; doc?: SequenceDocument; selection: Selection; text: string } | null>(null);
  const [documentDialog, setDocumentDialog] = useState<DocumentMode | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInputs, setSearchInputs] = useState<Record<number, SearchOptions>>({});
  const [exportOpen, setExportOpen] = useState(false), [recoveryOpen, setRecoveryOpen] = useState(false);
  const [draftCloseKey, setDraftCloseKey] = useState<number | null>(null);
  const [pcrInputs, setPcrInputs] = useState<Record<number, PcrOptions>>({});
  const [pendingExport, setPendingExport] = useState<{ key: number; doc: SequenceDocument } | null>(null);
  const [dialog, setDialog] = useState<{ mode: EditMode; key: number; featureId?: string } | null>(null);
  const width = useWindowWidth();
  const [explorerWanted, setExplorerWanted] = useState(storedExplorer);
  const [infoWanted, setInfoWanted] = useState(false);
  const [viewport, setViewport] = useState({ start: 0, end: 1 });
  const [explorerWidth, setExplorerWidth] = useState(208);
  const [infoWidth, setInfoWidth] = useState(280);
  const layout = panelLayout(width, explorerWanted, infoWanted, explorerWidth, infoWidth);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [labels, setLabels] = useState(true), [reverse, setReverse] = useState(true);
  const [loading, setLoading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const importBusy = useRef(false);
  const workspaceRef = useRef(workspace); workspaceRef.current = workspace;
  const bindings = useRef(new Map<number,FileBinding>());
  const [nativeBusy,setNativeBusy]=useState(false),[quitOpen,setQuitOpen]=useState(false);
  const [nativeInfo,setNativeInfo]=useState('');
  const [nativePath,setNativePath]=useState('');
  useEffect(()=>{setNativePath(workspace.active===null?'':bindings.current.get(workspace.active)?.path??'Not saved to a native file');},[workspace.active,nativeBusy]);
  useEffect(()=>{
    if(!isDesktop())return;
    void nativeCall<{dataDirectory:string}>('desktop_info').then(info=>setNativeInfo(info.dataDirectory)).catch(e=>setNativeInfo(e.message));
  },[]);

  const entry = workspace.documents.find(d => d.key === workspace.active);
  const openEditor = (mode: EditMode, featureId?: string) => { if (entry && !importBusy.current) { setMessage(null); setPendingExport(null); setDialog({ mode, key: entry.key, featureId }); } };
  const closeDocument = (key: number, discardDraft = false) => {
    if (importBusy.current) return;
    const target = workspace.documents.find(d => d.key === key);
    if (target && !discardDraft && hasPcrDraft(target.doc, pcrInputs[key])) { setDraftCloseKey(key); return; }
    if (target && needsExport(target) && !window.confirm("Unexported changes. Close and discard these changes?")) return;
    const binding=bindings.current.get(key);
    if(binding){void nativeCall('desktop_release',{token:binding.token}).catch(()=>{});bindings.current.delete(key);}
    dispatch({ type: 'close', key });
    setDraftCloseKey(null);
    if (pendingExport?.key === key) { setPendingExport(null); setMessage(null); }
    setSearchInputs(old => { const next = { ...old }; delete next[key]; return next; });
    setPcrInputs(old => { const next = { ...old }; delete next[key]; return next; });
  };
  const applyEdit = (result: CommandResult) => {
    if (!dialog) return;
    dispatch({ type: 'commit', key: dialog.key, doc: result.doc, selection: result.selection });
    setDialog(null);
    setMessage({ text: result.warnings.join(' ') || "Changes applied. Export the document to keep your work.", error: false });
  };
  const select = (selection: Selection) => dispatch({ type: 'select', selection });
  const notifyError = (text: string) => setMessage({ text, error: true });
  const toggleExplorer = () => {
    const wanted = !explorerWanted; setExplorerWanted(wanted);
    try { localStorage.setItem('gin-schnaps.explorer', String(wanted)); } catch { /* Preferences are optional; never store DNA here. */ }
  };
  const exportDocument = () => {
    if (!entry) return;
    if(isDesktop()){void saveDesktop(true);return;}
    const safe = entry.doc.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'sequence';
    try { downloadFile(`${safe}.sg.json`, serializeDocument(entry.doc)); } catch (error) { notifyError((error as Error).message); return; }
    setPendingExport({ key: entry.key, doc: entry.doc });
    setMessage({ text: "Native export requested. Check that you received the file. The source file has not been overwritten." + (hasPcrDraft(entry.doc,pcrInputs[entry.key]) ? " Unsaved PCR draft NOT included: use Save PCR setup first." : ""), error: false });
  };
  const openDemo = (linear = false) => {
    const existing = workspace.documents.find(d => d.doc.id === (linear ? 'demo-linear-1200' : 'demo-circular-4800'));
    if (existing) { dispatch({ type: 'activate', key: existing.key }); return; }
    if (workspace.documents.length >= MAX_OPEN_DOCUMENTS) { notifyError("Close a document before opening another."); return; }
    dispatch({ type: 'open', documents: [createDemo(linear)], source: "Built-in synthetic example" });
  };
  const importFiles = async (files: FileList | File[]) => {
    if (documentDialog || dialog || exportOpen || recoveryOpen || draftCloseKey !== null || document.querySelector('[role="dialog"]') || importBusy.current || !files.length) return;
    importBusy.current = true; setLoading(true); setPendingExport(null);
    try {
      if (files.length !== 1) throw new Error("Open one file at a time. A FASTA file may contain multiple sequences.");
      const file = files[0];
      const parsed = await importLocalFile(file);
      if (workspaceRef.current.documents.length + parsed.documents.length > MAX_OPEN_DOCUMENTS) throw new Error("Maximum 16 open documents. Close tabs before trying again.");
      dispatch({ type: 'open', documents: parsed.documents, source: file.name });
      setMessage({ text: parsed.warnings.join(' ') || "Document imported and validated. No data transmitted.", error: false });
    } catch (error) { notifyError(error instanceof Error ? error.message : "Import error."); }
    finally { importBusy.current = false; setLoading(false); if (fileInput.current) fileInput.current.value = ''; }
  };

  const saveDesktopEntry = async (target: OpenDocument, saveAs=false):Promise<boolean> => {
    // Capture the exact document object. Late acknowledgement never clears newer edits.
    const captured=target.doc;
    const result=await nativeCall<NativeSave|null>('desktop_save',{
      token:saveAs?null:bindings.current.get(target.key)?.token??null,text:serializeDocument(captured),name:captured.name
    });
    if(!result)return false;
    const prior=bindings.current.get(target.key);
    bindings.current.set(target.key,{token:result.token,path:result.path});
    if(prior&&prior.token!==result.token)void nativeCall('desktop_release',{token:prior.token}).catch(()=>{});
    dispatch({type:'checkpoint',key:target.key,doc:captured});
    setNativePath(result.path);
    setMessage({text:`Saved and verified: ${result.path}.${result.backup?' Previous version: '+result.backup+'.':''} ${result.warnings.join(' ')}${hasPcrDraft(target.doc,pcrInputs[target.key]) ? ' Unsaved PCR draft NOT included: use Save PCR setup first.' : ''}`,error:false});
    return true;
  };
  const saveDesktop = async(saveAs=false) => {
    if(!entry||importBusy.current)return;
    importBusy.current=true;setNativeBusy(true);
    try{await saveDesktopEntry(entry,saveAs);}catch(e){notifyError((e as Error).message);}
    finally{importBusy.current=false;setNativeBusy(false);}
  };
  const openFile = async() => {
    if(!isDesktop()){fileInput.current?.click();return;}
    if(importBusy.current||document.querySelector('[role="dialog"]'))return;
    importBusy.current=true;setNativeBusy(true);
    let file:NativeFile|null=null;
    try{
      file=await nativeCall<NativeFile|null>('desktop_open');if(!file)return;
      const parsed=await importLocalFile(new File([bytesFromBase64(file.base64)],file.name));
      const current=workspaceRef.current;
      if(current.documents.length+parsed.documents.length>MAX_OPEN_DOCUMENTS)throw new Error('Maximum 16 open documents. Close tabs first.');
      if(file.writable&&parsed.documents.length===1){
        bindings.current.set(current.nextKey,{token:file.token,path:file.path});
      }else{await nativeCall('desktop_release',{token:file.token});}
      dispatch({type:'open',documents:parsed.documents,source:file.name});
      setMessage({text:parsed.warnings.join(' ')||'Opened locally. Save writes .sg.json; interchange sources are protected.',error:false});
    }catch(e){if(file)void nativeCall('desktop_release',{token:file.token}).catch(()=>{});notifyError((e as Error).message);}
    finally{importBusy.current=false;setNativeBusy(false);}
  };
  const requestQuit = async() => {
    if(importBusy.current)return;
    if (document.querySelector('[role="dialog"]')) { notifyError('Finish or cancel the open dialog before quitting.'); return; }
    // Always confirm: an unsaved oligo/PCR draft can exist without document dirty state.
    setQuitOpen(true);
  };
  const quitSaved = async() => {
    if (workspaceRef.current.documents.some(d => hasPcrDraft(d.doc, pcrInputs[d.key]))) throw new Error('Unsaved PCR drafts remain. Keep working and save each PCR setup first.');
    const targets=workspaceRef.current.documents.filter(needsExport);
    importBusy.current=true;
    try{
      for(const target of targets)if(!await saveDesktopEntry(target))throw new Error('Save cancelled. The application is still open.');
      await nativeCall('desktop_close');
    }finally{importBusy.current=false;}
  };
  useEffect(()=>{
    const action=(event:Event)=>{
      const name=(event as CustomEvent<string>).detail;
      if(name==='quit'){void requestQuit();return;}
      if(document.querySelector('[role="dialog"]')||importBusy.current)return;
      if(name==='open')void openFile();
      else if(name==='save')void saveDesktop();
      else if(name==='save-as')void saveDesktop(true);
      else if(name==='new')setDocumentDialog('new');
    };
    const error=(event:Event)=>notifyError((event as CustomEvent<string>).detail);
    window.addEventListener('gin-schnaps-native-action',action);window.addEventListener('gin-schnaps-export-error',error);
    return()=>{window.removeEventListener('gin-schnaps-native-action',action);window.removeEventListener('gin-schnaps-export-error',error);};
  });
  const copySelection = async (complementary = false) => {
    if (!entry?.selection) return;
    const selected = selectedSequence(entry.doc, entry.selection);
    const text = complementary ? reverseComplement(selected) : selected;
    setCopiedDNA({ sequence: text, sourceName: entry.doc.name });
    try {
      await writeClipboardText(text);
      setMessage({ text: `${number(text.length)} bases copied${complementary ? " as reverse complement (5′→3′)" : " in the reference-strand direction"}. Source annotations are not copied.`, error: false });
    } catch {
      notifyError('System clipboard access was refused. The bases remain in session memory: switch documents, open Paste and choose Use last copied DNA.');
    }
  };
  const openPaste = (text = '') => {
    if (importBusy.current || nativeBusy || document.querySelector('[role="dialog"]')) return;
    if (text.length > MAX_PASTE_CHARACTERS) { notifyError('Clipboard text exceeds 400,000 characters. Nothing was pasted; open a sequence file instead.'); return; }
    const current = workspaceRef.current.documents.find(d => d.key === workspaceRef.current.active);
    setMessage(null); setPendingExport(null);
    setPasteDialog({ key: current?.key ?? null, doc: current?.doc, selection: current?.selection ?? null, text });
  };
  const applyPaste = (result: CommandResult) => {
    if (!pasteDialog || pasteDialog.key === null) return;
    const target = workspaceRef.current.documents.find(d => d.key === pasteDialog.key);
    if (!target || target.doc !== pasteDialog.doc) { notifyError('The destination changed while the paste was open. Cancel and reopen Paste. Nothing was applied.'); return; }
    dispatch({ type: 'commit', key: target.key, doc: result.doc, selection: result.selection });
    setPasteDialog(null);
    setMessage({ text: 'Pasted bases applied. Undo is available. Save or export the destination to keep the change. ' + result.warnings.join(' '), error: false });
  };
  const createPastedDocument = (doc: SequenceDocument) => {
    if (workspaceRef.current.documents.length >= MAX_OPEN_DOCUMENTS) { notifyError('Maximum open documents reached. Close a document first.'); return; }
    dispatch({ type: 'open', documents: [doc], source: 'Pasted DNA (bases only)', dirty: true });
    setPasteDialog(null);
  };
  useEffect(() => {
    // Native Edit > Copy/Paste and browser context-menu actions use the same path.
    // Text fields and selected prose retain the operating system's usual behavior.
    const copy = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isTextEntry(event.target) || hasSelectedText() || document.querySelector('[role="dialog"]') || !entry?.selection || !event.clipboardData) return;
      const text = selectedSequence(entry.doc, entry.selection);
      event.preventDefault(); event.clipboardData.clearData(); event.clipboardData.setData('text/plain', text);
      setCopiedDNA({ sequence: text, sourceName: entry.doc.name });
    };
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || isTextEntry(event.target) || document.querySelector('[role="dialog"]') || importBusy.current || nativeBusy || !event.clipboardData) return;
      event.preventDefault(); openPaste(event.clipboardData.getData('text/plain'));
    };
    window.addEventListener('copy', copy); window.addEventListener('paste', paste);
    return () => { window.removeEventListener('copy', copy); window.removeEventListener('paste', paste); };
  });
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (documentDialog || dialog || pasteDialog || exportOpen || recoveryOpen || quitOpen || nativeBusy || draftCloseKey !== null || document.querySelector('[role="dialog"]')) { if ((event.metaKey || event.ctrlKey) && ['o','s','n','f'].includes(event.key.toLowerCase())) event.preventDefault(); return; }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'f' && entry) { event.preventDefault(); setSearchOpen(true); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'n') { event.preventDefault(); setDocumentDialog('new'); }
      const editing = isTextEntry(event.target);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'v' && !editing && !importBusy.current) {
        // Focus a real textarea before the browser performs its default paste.
        // No background clipboard read, permission request or synthetic paste.
        flushSync(() => openPaste());
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); void openFile(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if(isDesktop())void saveDesktop(event.shiftKey);else exportDocument(); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && !editing && !hasSelectedText() && entry?.selection) { event.preventDefault(); void copySelection(event.shiftKey); }
      if ((event.metaKey || event.ctrlKey) && !editing && event.key.toLowerCase() === 'z') {
        event.preventDefault(); dispatch({ type: event.shiftKey ? 'redo' : 'undo' });
      }
      if (event.key === 'Escape') setMessage(null);
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  });
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (!isDesktop() && (pasteDialog !== null || workspace.documents.some(needsExport) || workspace.documents.some(d => hasPcrDraft(d.doc, pcrInputs[d.key])))) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [workspace.documents, pcrInputs, pasteDialog]);
  const draftCloseEntry = workspace.documents.find(d => d.key === draftCloseKey);
  const draftEntries = workspace.documents.filter(d => hasPcrDraft(d.doc, pcrInputs[d.key]));
  const range = entry ? toUserRange(entry.selection, entry.doc.sequence.length) : null;
  const resizePanel = (event: React.PointerEvent<HTMLDivElement>, panel: 'explorer' | 'info') => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const startX = event.clientX, initial = panel === 'explorer' ? explorerWidth : infoWidth;
    const element = event.currentTarget;
    const move = (e: PointerEvent) => {
      const proposed = initial + (e.clientX - startX) * (panel === 'explorer' ? 1 : -1);
      const max = Math.min(panel === 'explorer' ? 280 : 360, width - 720 - (panel === 'explorer' ? (layout.info ? infoWidth : 0) : (layout.explorer ? explorerWidth : 0)));
      (panel === 'explorer' ? setExplorerWidth : setInfoWidth)(Math.max(panel === 'explorer' ? 176 : 240, Math.min(max, proposed)));
    };
    const up = () => { element.removeEventListener('pointermove', move); element.removeEventListener('pointerup', up); element.removeEventListener('pointercancel', up); };
    element.addEventListener('pointermove', move); element.addEventListener('pointerup', up); element.addEventListener('pointercancel', up);
  };
  const separator = (panel: 'explorer' | 'info') => <div role="separator" aria-label={`Width of ${panel === 'explorer' ? "explorer" : "information"}`} aria-orientation="vertical"
    aria-valuenow={panel === 'explorer' ? explorerWidth : infoWidth} aria-valuemin={panel === 'explorer' ? 176 : 240} aria-valuemax={panel === 'explorer' ? 280 : 360}
    tabIndex={0} className={`panel-resizer ${panel}`} onPointerDown={e => resizePanel(e, panel)}
    onKeyDown={e => { if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault();
      const delta = (e.key === 'ArrowRight' ? 8 : -8) * (panel === 'info' ? -1 : 1);
      if (panel === 'explorer') setExplorerWidth(w => Math.max(176, Math.min(280, w + delta)));
      else setInfoWidth(w => Math.max(240, Math.min(360, w + delta))); }} />;
  return <div className="app" style={{ '--explorer-width': `${layout.explorer ? explorerWidth : 0}px`, '--info-width': `${layout.info ? infoWidth : 0}px` } as React.CSSProperties}
    onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault(); }}
    onDrop={event => { event.preventDefault(); void importFiles(event.dataTransfer.files); }}>
    <input ref={fileInput} type="file" accept=".fa,.fasta,.fna,.gb,.gbk,.genbank,.dna,.sg.json,.json" hidden data-testid="file-input" onChange={e => { if (e.target.files) void importFiles(e.target.files); }}/>
    <header className="document-strip"><div className="brand"><button className="icon-button" aria-label="Show or hide explorer" aria-pressed={layout.explorer} onClick={toggleExplorer}><Icon name="panel"/></button><strong>Gin Schnaps</strong><span className="version">0.8.3</span></div>
      <div className="document-tabs" role="tablist" aria-label="Open documents">{workspace.documents.map(doc => <div key={doc.key} className={`document-tab ${doc.key === workspace.active ? 'active' : ''}`}>
        <button role="tab" aria-selected={doc.key === workspace.active} title={doc.doc.name} aria-label={doc.doc.name} onClick={() => dispatch({ type: 'activate', key: doc.key })}><Icon name={doc.doc.topology === 'circular' ? 'circle' : 'linear'}/><span>{doc.doc.name}</span>{needsExport(doc) && <span className="dirty-dot" aria-label="Unexported changes">●</span>}</button>
        <button className="icon-button close-document" aria-label={`Close ${doc.doc.name}`} onClick={() => closeDocument(doc.key)}><Icon name="close" size={12}/></button>
      </div>)}</div><button className="icon-button" title="Open a local file" aria-label="Open a local file" onClick={() => void openFile()}><Icon name="plus"/></button>
    </header>
    {isDesktop()&&<div className="native-file-bar" title={`Recovery and previous copies: ${nativeInfo}`}><strong>Desktop preview</strong><span>{nativePath}</span><span>⌘/Ctrl S: Save · Shift: Save As</span></div>}
    <div className="main-frame">
      {layout.explorer && <aside className="explorer-panel" aria-label="Explorer"><div className="panel-heading"><strong>WORKSPACE</strong></div>
        <label className="search-field explorer-search"><Icon name="search"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Filter documents" aria-label="Filter documents"/></label>
        <h3 className="section-label">OPEN DOCUMENTS <span>{workspace.documents.length}</span></h3>
        <div className="document-list">{workspace.documents.filter(d => d.doc.name.toLowerCase().includes(query.toLowerCase())).map(d => <button key={d.key} className={d.key === workspace.active ? 'current' : ''} onClick={() => dispatch({ type: 'activate', key: d.key })}>
          <Icon name={d.doc.topology === 'circular' ? 'circle' : 'linear'}/><span>{d.doc.name}<small>{number(d.doc.sequence.length)} bp · {d.doc.topology === 'circular' ? "circular" : "linear"}</small></span></button>)}</div>
        <h3 className="section-label">SYNTHETIC EXAMPLES</h3><button className="example-link" onClick={() => openDemo()}><Icon name="circle"/>Plasmid · 4,800 bp</button><button className="example-link" onClick={() => openDemo(true)}><Icon name="linear"/>Fragment · 1,200 bp</button>
        <div className="explorer-note"><Icon name="info"/><p>Local files only.<br/>No account or synchronization.</p></div>{separator('explorer')}
      </aside>}
      <main className="document-workspace">
        <div className="document-toolbar" role="toolbar" aria-label="Document tools">
          <Tool icon="folder" title="Open a file (⌘/Ctrl O)" disabled={loading} onClick={() => void openFile()}>Open</Tool>
          {isDesktop()&&<><button onClick={()=>void saveDesktop()} disabled={!entry||nativeBusy} title="Save native document (⌘/Ctrl S)">Save</button><button onClick={()=>void saveDesktop(true)} disabled={!entry||nativeBusy} title="Save native document as (⌘/Ctrl Shift S)">Save As…</button></>}
          {!isDesktop()&&<Tool icon="save" title="Export native format (⌘/Ctrl S)" disabled={!entry} onClick={exportDocument}>Native</Tool>}<Tool icon="save" title="Export current document as GenBank" disabled={!entry} onClick={() => { setPendingExport(null); setMessage(null); setExportOpen(true); }}>GenBank</Tool><span className="tool-divider"/>
          <Tool icon="undo" title="Undo (⌘/Ctrl Z)" disabled={!entry?.past.length} onClick={() => dispatch({ type: 'undo' })}/><Tool icon="redo" title="Redo (⌘/Ctrl ⇧ Z)" disabled={!entry?.future.length} onClick={() => dispatch({ type: 'redo' })}/><Tool icon="sequence" title="Edit bases" disabled={!entry} onClick={() => openEditor('bases')}>Edit</Tool>
          <Tool icon="copy" title="Copy selection (⌘/Ctrl C)" disabled={!entry?.selection} onClick={() => void copySelection()}/><Tool icon="copy" title="Paste DNA (⌘/Ctrl V)" disabled={loading || nativeBusy} onClick={() => openPaste()}>Paste…</Tool><span className="tool-divider"/>
          <Tool icon="cut" title="Open restriction analysis" disabled={!entry} onClick={() => dispatch({ type: 'view', view: 'enzymes' })}>Digestion</Tool><Tool icon="primer" title="Simulate PCR" disabled={!entry} onClick={() => dispatch({ type: 'view', view: 'primers' })}>PCR</Tool>
          <span className="flex-spacer"/><span className="readonly-badge">{entry && needsExport(entry) ? "Modified · not exported" : "Prototype · step 8"}</span><Tool icon="info" title="Document information" disabled={!entry} active={layout.info} onClick={() => setInfoWanted(!infoWanted)}/>
        </div>
        <div className="command-bar" role="toolbar" aria-label="Document operations">
          <button onClick={() => { setMessage(null); setDocumentDialog('new'); }} disabled={loading || workspace.documents.length >= MAX_OPEN_DOCUMENTS} title="New document from pasted DNA (⌘/Ctrl N)"><Icon name="plus"/>New</button>
          <button disabled={!entry} onClick={() => { setMessage(null); setDocumentDialog('metadata'); }}>Properties</button>
          <button disabled={!entry || workspace.documents.length >= MAX_OPEN_DOCUMENTS} onClick={() => { setMessage(null); setDocumentDialog('duplicate'); }}>Duplicate</button>
          <button disabled={!entry?.selection || workspace.documents.length >= MAX_OPEN_DOCUMENTS} onClick={() => { setMessage(null); setDocumentDialog('extract'); }}>Extract…</button>
          <button disabled={!entry} onClick={() => { setMessage(null); setDocumentDialog('reverse-complement'); }} title="Reverse-complement the entire molecule">Reverse complement…</button>
          <button disabled={entry?.doc.topology !== 'circular'} onClick={() => { setMessage(null); setDocumentDialog('rotate-origin'); }}>Set origin…</button>
          <button disabled={!entry?.selection} onClick={() => void copySelection(true)} title="Copy selection as reverse complement (⌘/Ctrl ⇧ C)">Copy RC</button>
          <span className="flex-spacer"/><button disabled={!entry} aria-pressed={searchOpen} onClick={() => setSearchOpen(!searchOpen)} title="Find DNA motif (⌘/Ctrl F)"><Icon name="search"/>Find</button>
        </div>
        {!entry ? <EmptyView icon="folder" title="No document open">Open a FASTA, GenBank or .sg.json file, or <button onClick={() => openDemo()}>load the synthetic example</button>.</EmptyView> : <div className="workspace-columns">
          <section className="view-panel" aria-label="Active document">
            <div className="view-header"><nav className="view-tabs" role="tablist" aria-label="Document views">{VIEWS.map((view, index) => <button key={view.id} id={`tab-${view.id}`} role="tab" aria-selected={entry.view === view.id} aria-controls="active-view" tabIndex={entry.view === view.id ? 0 : -1}
              className={entry.view === view.id ? 'active' : ''} onClick={() => dispatch({ type: 'view', view: view.id })}
              onKeyDown={event => { if (!['ArrowRight','ArrowLeft','Home','End'].includes(event.key)) return; event.preventDefault();
                const next = event.key === 'Home' ? 0 : event.key === 'End' ? VIEWS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : VIEWS.length - 1)) % VIEWS.length;
                dispatch({ type: 'view', view: VIEWS[next].id }); document.getElementById(`tab-${VIEWS[next].id}`)?.focus(); }}><Icon name={view.icon}/>{view.label}</button>)}</nav></div>
            {searchOpen && <SearchPanel key={`search-${entry.key}`} entry={entry} options={searchInputs[entry.key] ?? DEFAULT_SEARCH} onChange={options => setSearchInputs(old => ({ ...old, [entry.key]: options }))} onSelect={select} onClose={() => setSearchOpen(false)}/>}
            <div className="document-context"><span>{entry.doc.name}</span><span className="muted">{number(entry.doc.sequence.length)} bp · {entry.doc.topology === 'circular' ? "circular" : "linear"}</span>
              <span className="flex-spacer"/>{entry.doc.provenance === 'synthetic-demo' && <span className="demo-badge">SYNTHETIC DATA</span>}</div>
            {explorerWanted && !layout.explorer && layout.info && <div className="compact-notice">Explorer temporarily hidden to preserve document width.</div>}
            <div id="active-view" className="active-view" role="tabpanel" aria-labelledby={`tab-${entry.view}`}>
              {(entry.view === 'map' || entry.view === 'sequence') && <div className="display-rail" role="toolbar" aria-label="Display">
                <Tool icon="circle" title="Circular presentation" disabled={entry.doc.topology !== 'circular'} active={entry.presentation === 'circular'} onClick={() => dispatch({ type: 'presentation', presentation: 'circular' })}/>
                <Tool icon="linear" title="Linear presentation (does not change topology)" active={entry.presentation === 'linear'} onClick={() => dispatch({ type: 'presentation', presentation: 'linear' })}/>
                <span className="rail-divider"/><Tool icon="feature" title="Show feature labels" active={labels} onClick={() => setLabels(!labels)}/>
                <Tool icon="sequence" title="Show the complementary strand" active={reverse} disabled={entry.view !== 'sequence'} onClick={() => setReverse(!reverse)}/>
              </div>}
              {entry.view === 'map' && <MapView entry={entry} onSelect={select} labels={labels}/>}
              {entry.view === 'sequence' && <SequenceView key={entry.key} entry={entry} onSelect={select} reverse={reverse} labels={labels} onViewport={setViewport} onScroll={scrollTop => dispatch({ type: 'scroll', scrollTop })} onEditFeature={id => openEditor('feature', id)} onShowFeatures={() => dispatch({ type: 'view', view: 'features' })}/>}
              {entry.view === 'features' && <FeatureTable key={entry.key} entry={entry} select={select} toggle={id => dispatch({ type: 'visibility', id })} edit={id => openEditor('feature', id)}/>}
              {entry.view === 'translation' && <TranslationPanel key={entry.key} entry={entry}/>}
              {entry.view === 'enzymes' && <RestrictionPanel key={entry.key} entry={entry} onSelect={s => { select(s); dispatch({ type: 'view', view: 'map' }); }}/>}
              {entry.view === 'primers' && <PcrPanel onCommit={result=>{dispatch({type:'commit',key:entry.key,doc:result.doc,selection:result.selection});setPendingExport(null);if(result.warnings.length)setMessage({text:result.warnings.join(' '),error:false});}} key={entry.key} entry={entry} input={pcrInputs[entry.key] ?? recipeOptions(entry.doc) ?? EMPTY_PCR} setInput={input => setPcrInputs(old => ({ ...old, [entry.key]: input }))} onSelect={s => { select(s); dispatch({ type: 'view', view: 'map' }); }}/>}
              {entry.view === 'history' && <div className="history-view"><h2>Document history</h2><div className="history-event"><Icon name="folder"/><div><strong>Document opened in this workspace</strong><p>{entry.source}</p><small>No cloning history imported or reconstructed. The operations below come from the native document; they are not evidence of experimental work.</small></div></div>{entry.doc.historyOmitted > 0 && <p className="analysis-warning" data-testid="history-retention">{entry.doc.historyOmitted} older operation description(s) are no longer retained in this document. Sequence, annotations, oligos and source archives are not removed. Older exports may retain earlier descriptions.</p>}{entry.doc.history.map((event, i) => <div className="history-event" key={i}><Icon name="history"/><div><strong>{entry.doc.historyOmitted + i + 1}. {event.summary}</strong>{event.warnings.map((w,j) => <p key={j}>{w}</p>)}</div></div>)}<p className="field-note">Retained journal: up to 500 recent descriptions and about 512 kB after each edit; older descriptions are counted, not silently claimed as complete. Undo/redo: {entry.past.length} previous state(s), {entry.future.length} next state(s), in this session only.</p></div>}
            </div>
            {entry.view === 'sequence' && <Minimap entry={entry} viewport={viewport} onNavigate={fraction => { const node = document.querySelector<HTMLElement>('.sequence-viewport'); if (node) node.scrollTop = fraction * (node.scrollHeight - node.clientHeight); }}/ >}
            {(entry.view === 'map' || entry.view === 'sequence') && <SelectionBar key={`selection-${entry.key}`} doc={entry.doc} selection={entry.selection} onSelect={select} onError={notifyError}/>}
          </section>
          {layout.info && <div className="info-container">{separator('info')}<InfoPanel entry={entry} close={() => setInfoWanted(false)} editTopology={() => openEditor('topology')}/></div>}
        </div>}
      </main>
    </div>
    <footer className="status-bar" role="status"><span>{loading ? "Reading file…" : entry ? `${number(entry.doc.sequence.length)} bp · DNA ${entry.doc.topology === 'circular' ? "circular" : "linear"}` : "No document"}</span><span className="status-selection" data-testid="selection-status">{range ? `Selection ${number(range.start)} → ${number(range.end)} · ${number(entry!.selection!.length)} bp${range.end < range.start ? " · crosses origin" : ''}` : "No selection"}</span><span className="flex-spacer"/><button className="recovery-toggle" onClick={() => setRecoveryOpen(true)}>Recovery</button><span>{draftEntries.length ? `${draftEntries.length} PCR draft(s) not saved · ` : ""}Local · no transmission</span></footer>
    {pasteDialog && <PasteDialog doc={pasteDialog.doc} selection={pasteDialog.selection} initialText={pasteDialog.text} copied={copiedDNA} canCreate={workspace.documents.length < MAX_OPEN_DOCUMENTS} onClose={() => setPasteDialog(null)} onApply={applyPaste} onCreate={createPastedDocument}/>}
    {dialog && entry && <EditDialog key={`${dialog.key}-${dialog.mode}-${dialog.featureId ?? "new"}`} doc={entry.doc} selection={entry.selection} mode={dialog.mode} featureId={dialog.featureId} onClose={() => setDialog(null)} onApply={applyEdit}/>}
    <RecoveryPanel workspace={workspace} modalOpen={recoveryOpen} onClose={() => setRecoveryOpen(false)} restore={snapshot => {
      if (draftEntries.length && !window.confirm('Discard unsaved PCR drafts and replace this workspace with the recovered session?')) return false;
      setPendingExport(null); setMessage(null); setPcrInputs({});
      for(const binding of bindings.current.values())void nativeCall('desktop_release',{token:binding.token}).catch(()=>{});
      bindings.current.clear();
      dispatch({ type: 'restore', documents: snapshot.documents, activeIndex: snapshot.activeIndex }); setRecoveryOpen(false); return true;
    }}/>
    {exportOpen && entry && <ExportDialog doc={entry.doc} onClose={() => setExportOpen(false)} onExport={async(name, text) => {
      setExportOpen(false); setPendingExport(null);
      if(isDesktop())setNativeBusy(true);
      try{
        const written=await exportBlob(name,new Blob([text],{type:'text/plain;charset=utf-8'}));
        setMessage({text:written ? "GenBank export completed or requested in the browser. Keep the native .sg.json for the complete document." : "GenBank export cancelled. No file was written.",error:false});
      }catch(e){notifyError((e as Error).message);}
      finally{setNativeBusy(false);}
    }}/>}
    {documentDialog && <DocumentDialog key={`${documentDialog}-${entry?.key ?? 0}`} mode={documentDialog} entry={entry} onClose={() => setDocumentDialog(null)} onCreate={doc => {
      if (workspaceRef.current.documents.length >= MAX_OPEN_DOCUMENTS) { notifyError('Maximum 16 open documents.'); return; }
      dispatch({ type: 'open', documents: [doc], source: 'Created locally', dirty: true }); setDocumentDialog(null); setMessage(null); setPendingExport(null);
    }} onApply={result => { if (!entry) return; dispatch({ type: 'commit', key: entry.key, doc: result.doc, selection: result.selection }); setDocumentDialog(null); setPendingExport(null); setMessage({ text: 'Changes applied. Undo is available; export to keep your work.', error: false }); }}/>}
    {message && <div className={`notification ${message.error ? 'error' : ''}`} role={message.error ? 'alert' : 'status'}><Icon name={message.error ? 'warning' : 'info'}/><div className="notification-content"><p>{message.text}</p>{pendingExport && !message.error && <button className="small-button" onClick={() => { dispatch({ type: 'checkpoint', ...pendingExport }); setPendingExport(null); setMessage(null); }}>Confirm file received</button>}</div><button className="icon-button" aria-label="Close message" onClick={() => setMessage(null)}><Icon name="close"/></button></div>}
    {draftCloseEntry && <PcrDraftDialog name={draftCloseEntry.doc.name}
      validationError={pcrDraftError(pcrInputs[draftCloseEntry.key] ?? EMPTY_PCR)}
      onKeep={() => setDraftCloseKey(null)} onDiscard={() => closeDocument(draftCloseEntry.key, true)}
      onSave={() => {
        const result = executeCommand(draftCloseEntry.doc, {kind:'save-pcr',input:pcrInputs[draftCloseEntry.key] ?? EMPTY_PCR,newIds:[newDocumentId(),newDocumentId()]});
        dispatch({type:'commit',key:draftCloseEntry.key,doc:result.doc,selection:draftCloseEntry.selection});
        setPcrInputs(old => ({...old,[draftCloseEntry.key]:recipeOptions(result.doc) ?? EMPTY_PCR}));
        setDraftCloseKey(null);setPendingExport(null);
        setMessage({text:'PCR setup stored in the document. The tab remains open: save or export the native document to keep it. '+result.warnings.join(' '),error:false});
      }}/>}
    {nativeBusy&&<div className="modal-overlay native-busy"><div role="dialog" aria-modal="true" className="edit-dialog"><div className="dialog-body"><p>Complete or cancel the native file dialog. Do not close the application during a write.</p></div></div></div>}
    {quitOpen&&<NativeQuitDialog count={workspace.documents.filter(needsExport).length} draftNames={draftEntries.map(d => d.doc.name)} onReviewDraft={() => {
      const first = draftEntries[0]; if (!first) return;
      dispatch({type:'activate',key:first.key}); setQuitOpen(false);
      dispatch({type:'view',view:'primers'});
    }} onCancel={()=>setQuitOpen(false)} onDiscard={async()=>{await nativeCall('desktop_close');}} onSave={quitSaved}/>}
  </div>;
}
