import React, { useMemo, useState, useRef } from 'react';
import { SimpleCircularOrLinearView } from '@teselagen/ove';
import { fromOveSelection, toOveDocument, toOveSelection, type OveRange } from '../adapters/coordinates';
import { type OpenDocument } from '../domain/workspace';
import { type Selection } from '../domain/model';
import { exportMap } from '../view/map-export';
import { useSize } from './hooks';
export function MapView({ entry, onSelect, labels }: { entry: OpenDocument; onSelect: (s: Selection) => void; labels: boolean }) {
  const { ref, width, height } = useSize<HTMLDivElement>();
  const [zoom, setZoom] = useState(1), [error,setError] = useState(''), [exporting,setExporting] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const viewWidth = Math.max(240, width - 24) * zoom, viewHeight = Math.max(180, height - 64) * zoom;
  const scale = Math.min(viewWidth, viewHeight) / 300;
  const sequenceData = useMemo(() => toOveDocument(entry.doc, entry.presentation, entry.hiddenFeatures), [entry.doc, entry.presentation, entry.hiddenFeatures]);
  const save = async (format:'svg'|'png') => { const svg=canvas.current?.querySelector('svg'); if(!svg)return; setExporting(true);setError('');try { await exportMap(svg,entry.doc,format); } catch(e) {setError((e as Error).message);}finally{setExporting(false);} };
  return <div className="map-viewport" ref={ref} style={{ '--map-unit': `${1 / scale}px` } as React.CSSProperties} data-testid="map-view" aria-label={`Map of ${entry.doc.name}`}>
    <div className="map-controls"><label>Zoom <select aria-label="Map zoom" value={zoom} onChange={e => setZoom(Number(e.target.value))}>{[.75,1,1.25,1.5,2].map(z=><option key={z} value={z}>{z*100}%</option>)}</select></label><button onClick={()=>setZoom(1)}>Fit</button><span className="flex-spacer"/><button disabled={exporting} onClick={()=>void save('svg')}>Export SVG</button><button disabled={exporting} onClick={()=>void save('png')}>Export PNG</button></div>
    {entry.doc.features.some(f=>f.unresolved) && <p className="field-note">{entry.doc.features.filter(f=>f.unresolved).length} unresolved feature(s) are listed under Features, not drawn as exact locations.</p>}
    {error && <p className="validation-error" role="status">{error}</p>}
    <div className="map-scroll"><div className="map-render" ref={canvas} style={{width:viewWidth,height:viewHeight}}>
      <SimpleCircularOrLinearView key={`${entry.key}-${entry.presentation}`} editorName="gin-schnaps-map"
        sequenceData={sequenceData} width={viewWidth} height={viewHeight}
        labelSize={13 / (1.75 * scale * Math.min(1,700/Math.min(viewWidth,viewHeight)))}
        annotationHeight={12/scale} nameFontSizeCircularView={14/scale} spaceBetweenAnnotations={5/scale}
        withSelectionEnabled={true} withCaretEnabled={true}
        selectionLayer={toOveSelection(entry.selection,entry.doc.sequence.length)}
        selectionLayerUpdate={(range:OveRange)=>onSelect(fromOveSelection(range,entry.doc.sequence.length,entry.doc.topology==='circular'))}
        annotationVisibility={{features:true,parts:false,primers:false,cutsites:false,translations:false,sequence:false,reverseSequence:false}}
        annotationLabelVisibility={{features:labels,parts:false,primers:false,cutsites:false}}
        showCicularViewInternalLabels={false} noWarnings={true} withChoosePreviewType={false} withDownload={false} withFullscreen={false} withVisibilityOptions={false}/>
    </div></div>
  </div>;
}
