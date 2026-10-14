import React, { useMemo, useState, useRef, useEffect } from 'react';
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
  const scroll = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({x:0,y:0});
  const panRef = useRef({x:0,y:0}), zoomRef=useRef(1);
  const drag = useRef<{id:number,x:number,y:number,origin:{x:number,y:number}}|null>(null);
  const setPosition=(p:{x:number,y:number})=>{panRef.current=p;setPan(p);};
  const scaleTo=(next:number,cursor={x:0,y:0})=>{
    const target=Math.max(.5,Math.min(6,Math.round(next*100)/100));
    const ratio=target/zoomRef.current;
    setPosition({x:cursor.x-(cursor.x-panRef.current.x)*ratio,y:cursor.y-(cursor.y-panRef.current.y)*ratio});
    zoomRef.current=target;setZoom(target);
  };
  const fit=()=>{zoomRef.current=1;setZoom(1);setPosition({x:0,y:0});};
  useEffect(()=>{fit();},[entry.key,entry.presentation]);
  useEffect(()=>{
    const el=scroll.current;if(!el)return;
    const handler=(e:WheelEvent)=>{
      if(!Number.isFinite(e.deltaY)||e.deltaY===0)return;
      e.preventDefault();
      const r=el.getBoundingClientRect();
      const at={x:e.clientX-r.left-r.width/2,y:e.clientY-r.top-r.height/2};
      const dy=Math.max(-250,Math.min(250,e.deltaY));
      scaleTo(zoomRef.current*Math.exp(-dy*(e.deltaMode===1?.045:.002)),at);
    };
    el.addEventListener('wheel',handler,{passive:false});
    return()=>el.removeEventListener('wheel',handler);
  },[]);
  const panStart=(e:React.PointerEvent<HTMLDivElement>)=>{
    const t=e.target as Element;
    const empty=t===e.currentTarget||t.tagName.toLowerCase()==='svg'||t===canvas.current;
    if(!(e.button===1||(e.button===0&&(e.shiftKey||empty))))return;
    e.preventDefault();e.stopPropagation();
    drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,origin:{...panRef.current}};
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const panMove=(e:React.PointerEvent<HTMLDivElement>)=>{
    const d=drag.current;if(!d||d.id!==e.pointerId)return;
    setPosition({x:d.origin.x+e.clientX-d.x,y:d.origin.y+e.clientY-d.y});
  };
  const panStop=(e:React.PointerEvent<HTMLDivElement>)=>{
    if(drag.current?.id!==e.pointerId)return;
    drag.current=null;
    if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);
  };
  const viewWidth = Math.max(240, width - 24) * zoom, viewHeight = Math.max(180, height - 64) * zoom;
  const scale = Math.min(viewWidth, viewHeight) / 300;
  const sequenceData = useMemo(() => toOveDocument(entry.doc, entry.presentation, entry.hiddenFeatures), [entry.doc, entry.presentation, entry.hiddenFeatures]);
  const save = async (format:'svg'|'png') => { const svg=canvas.current?.querySelector('svg'); if(!svg)return; setExporting(true);setError('');try { await exportMap(svg,entry.doc,format); } catch(e) {setError((e as Error).message);}finally{setExporting(false);} };
  return <div className="map-viewport" ref={ref} style={{ '--map-unit': `${1 / scale}px` } as React.CSSProperties} data-testid="map-view" aria-label={`Map of ${entry.doc.name}`}>
    <div className="map-controls"><button aria-label="Zoom out map" onClick={()=>scaleTo(zoomRef.current/1.25)}>−</button><label>Zoom <select aria-label="Map zoom" value={zoom} onChange={e=>scaleTo(Number(e.target.value))}>{![.5,.75,1,1.25,1.5,2,3,4,6].includes(zoom)&&<option value={zoom}>{Math.round(zoom*100)}%</option>}{[.5,.75,1,1.25,1.5,2,3,4,6].map(z=><option key={z} value={z}>{z*100}%</option>)}</select></label><button aria-label="Zoom in map" onClick={()=>scaleTo(zoomRef.current*1.25)}>+</button><button onClick={fit} aria-label="Fit and center map">Fit</button><span className="map-gesture-hint">Wheel: zoom · drag empty space or Shift+drag: pan</span><span className="flex-spacer"/><button disabled={exporting} onClick={()=>void save('svg')}>Export SVG</button><button disabled={exporting} onClick={()=>void save('png')}>Export PNG</button></div>
    {entry.doc.features.some(f=>f.unresolved) && <p className="field-note">{entry.doc.features.filter(f=>f.unresolved).length} unresolved feature(s) are listed under Features, not drawn as exact locations.</p>}
    {error && <p className="validation-error" role="status">{error}</p>}
    <div className="map-scroll" ref={scroll} tabIndex={0} aria-label="Plasmid map canvas: wheel zoom and drag pan" onPointerDownCapture={panStart} onPointerMove={panMove} onPointerUp={panStop} onPointerCancel={panStop} onLostPointerCapture={()=>{drag.current=null;}}><div className="map-render" ref={canvas} style={{width:viewWidth,height:viewHeight,transform:`translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`}}>
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
