import { type SequenceDocument, type Selection, MAX_OPEN_DOCUMENTS } from './model';
export type View = 'map' | 'sequence' | 'split' | 'enzymes' | 'features' | 'primers' | 'history' | 'translation';
export type Snapshot = { doc: SequenceDocument; selection: Selection; selectedFeatureIds?: string[]; editCaret?: number };
export type OpenDocument = {
  selectedFeatureIds?: string[]; typing?: boolean; editCaret?: number;
  key: number; revision: number; doc: SequenceDocument; view: View; selection: Selection;
  presentation: 'circular' | 'linear'; hiddenFeatures: string[]; scrollTop: number;
  source: string; past: Snapshot[]; future: Snapshot[]; exportedDoc: SequenceDocument | null;
};
export type Workspace = { documents: OpenDocument[]; active: number | null; nextKey: number };
export type WorkspaceAction =
  | { type: 'append-backup'; expectedNextKey: number; workspace: Workspace }
  | { type: 'restore'; documents: { doc: SequenceDocument; source: string }[]; activeIndex: number }
  | { type: 'open'; documents: SequenceDocument[]; source: string; dirty?: boolean }
  | { type: 'activate'; key: number }
  | { type: 'close'; key: number }
  | { type: 'typing'; enabled: boolean }
  | { type: 'caret'; position: number }
  | { type: 'view'; view: View }
  | { type: 'select'; selection: Selection }
  | { type: 'select-features'; ids: string[] }
  | { type: 'presentation'; presentation: 'circular' | 'linear' }
  | { type: 'visibility'; id: string }
  | { type: 'scroll'; scrollTop: number }
  | { type: 'commit'; key: number; doc: SequenceDocument; selection: Selection; selectedFeatureIds?: string[]; editCaret?: number }
  | { type: 'checkpoint'; key: number; doc: SequenceDocument }
  | { type: 'undo' | 'redo' };
export const emptyWorkspace: Workspace = { documents: [], active: null, nextKey: 1 };
export function workspaceReducer(state: Workspace, action: WorkspaceAction): Workspace {
  if (action.type === 'append-backup') {
    if (state.nextKey !== action.expectedNextKey || state.documents.some((d, i) => action.workspace.documents[i] !== d)) throw new Error('Workspace changed. Reopen backup before restoring.');
    return action.workspace;
  }
  if (action.type === 'restore') {
    let restored = { ...emptyWorkspace, nextKey: state.nextKey };
    for (const item of action.documents) restored = workspaceReducer(restored, { type: 'open', documents: [item.doc], source: item.source });
    return { ...restored, active: restored.documents[action.activeIndex]?.key ?? null,
      documents: restored.documents.map(entry => ({ ...entry, exportedDoc: null })) };
  }
  if (action.type === 'open') {
    if (state.documents.length + action.documents.length > MAX_OPEN_DOCUMENTS) throw new Error(`Maximum ${MAX_OPEN_DOCUMENTS} open documents.`);
    const opened = action.documents.map((doc, i): OpenDocument => ({
      key: state.nextKey + i, revision: 0, doc, source: action.source, view: 'map', selection: null, selectedFeatureIds: [], typing: false, editCaret: 0,
      presentation: doc.topology, hiddenFeatures: [], scrollTop: 0, past: [], future: [], exportedDoc: action.dirty ? null : doc
    }));
    return { documents: [...state.documents, ...opened], active: opened[0]?.key ?? state.active, nextKey: state.nextKey + opened.length };
  }
  if (action.type === 'activate') return state.documents.some(d => d.key === action.key) ? { ...state, active: action.key } : state;
  if (action.type === 'close') {
    const index = state.documents.findIndex(d => d.key === action.key);
    const documents = state.documents.filter(d => d.key !== action.key);
    return { ...state, documents, active: state.active === action.key ? documents[Math.min(index, documents.length - 1)]?.key ?? null : state.active };
  }
  return { ...state, documents: state.documents.map(entry => {
    const target = action.type === 'commit' || action.type === 'checkpoint' ? action.key : state.active;
    if (entry.key !== target) return entry;
    switch (action.type) {
      case 'commit': {
        if (entry.doc === action.doc) return { ...entry, selection: action.selection, editCaret: action.editCaret ?? entry.editCaret };
        return { ...entry, revision: entry.revision + 1, doc: action.doc, selection: action.selection, selectedFeatureIds: entry.selectedFeatureIds?.filter(id => action.doc.features.some(f => f.id === id)), editCaret: action.editCaret ?? Math.min(entry.editCaret ?? 0, action.doc.sequence.length), scrollTop: 0,
          presentation: action.doc.topology === 'linear' ? 'linear' : entry.presentation,
          past: boundSnapshots([...entry.past, { doc: entry.doc, selection: entry.selection, selectedFeatureIds: entry.selectedFeatureIds, editCaret: entry.editCaret }]), future: [] };
      }
      case 'checkpoint': return { ...entry, exportedDoc: action.doc };
      case 'undo': {
        const previous = entry.past[entry.past.length - 1];
        return previous ? { ...entry, ...previous, revision: entry.revision + 1, scrollTop: 0,
          presentation: previous.doc.topology === 'linear' ? 'linear' : entry.presentation,
          past: entry.past.slice(0, -1), future: [...entry.future, { doc: entry.doc, selection: entry.selection, selectedFeatureIds: entry.selectedFeatureIds, editCaret: entry.editCaret }] } : entry;
      }
      case 'redo': {
        const next = entry.future[entry.future.length - 1];
        return next ? { ...entry, ...next, revision: entry.revision + 1, scrollTop: 0,
          presentation: next.doc.topology === 'linear' ? 'linear' : entry.presentation,
          past: boundSnapshots([...entry.past, { doc: entry.doc, selection: entry.selection, selectedFeatureIds: entry.selectedFeatureIds, editCaret: entry.editCaret }]), future: entry.future.slice(0, -1) } : entry;
      }
      case 'typing': return { ...entry, typing: action.enabled, editCaret: entry.selection?.start ?? Math.min(entry.editCaret ?? 0, entry.doc.sequence.length) };
      case 'caret': return Number.isInteger(action.position) && action.position >= 0 && action.position <= entry.doc.sequence.length ? { ...entry, editCaret: action.position } : entry;
      case 'view': return { ...entry, view: action.view };
      case 'select': return { ...entry, selection: action.selection };
      case 'select-features': return { ...entry, selectedFeatureIds: Array.from(new Set(action.ids)).filter(id => entry.doc.features.some(f => f.id === id)) };
      case 'presentation': return { ...entry, presentation: action.presentation };
      case 'scroll': return { ...entry, scrollTop: Math.max(0, action.scrollTop) };
      case 'visibility': return { ...entry, hiddenFeatures: entry.hiddenFeatures.includes(action.id)
        ? entry.hiddenFeatures.filter(id => id !== action.id) : [...entry.hiddenFeatures, action.id] };
    }
  }) };
}
export function panelLayout(width: number, explorerWanted: boolean, infoWanted: boolean, explorerWidth = 208, infoWidth = 280) {
  const info = infoWanted && width >= 720 + infoWidth;
  const explorer = explorerWanted && width - (info ? infoWidth : 0) >= 720 + explorerWidth;
  return { explorer, info, centerWidth: width - (explorer ? explorerWidth : 0) - (info ? infoWidth : 0) };
}

/** Bounded session-only undo. Source archives are shared, not copied into a file history. */
function boundSnapshots(snapshots: Snapshot[]): Snapshot[] {
  const result = snapshots.slice(-50);
  const weights = result.map(s => s.doc.sequence.length + JSON.stringify(s.doc.features).length + JSON.stringify(s.doc.history).length + JSON.stringify(s.doc.primers).length);
  let weight = weights.reduce((sum, n) => sum + n, 0);
  while (result.length > 1 && weight > 8_000_000) { weight -= weights.shift()!; result.shift(); }
  return result;
}
export function needsExport(entry: OpenDocument): boolean { return entry.doc !== entry.exportedDoc; }
