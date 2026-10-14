import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SimpleCircularOrLinearView } from '@teselagen/ove';
import { fromOveSelection, toOveDocument, toOveSelection, type OveRange } from '../adapters/coordinates';
import { type OpenDocument } from '../domain/workspace';
import { type Selection, type SequenceDocument } from '../domain/model';
import { exportMap } from '../view/map-export';
import { FIT_CAMERA, panCamera, wheelCamera, zoomCamera, type MapCamera } from '../view/map-camera';
import { useSize } from './hooks';

// Camera gestures do not rebuild SVG geometry, annotation labels or the DNA model.
const MapGraphic = memo(function MapGraphic({doc,presentation,hidden,selection,onSelect,labels,width,height}: {
  doc: SequenceDocument; presentation:'circular'|'linear'; hidden:string[]; selection:Selection;
  onSelect:(s:Selection)=>void; labels:boolean; width:number; height:number;
}) {
  const sequenceData=useMemo(()=>toOveDocument(doc,presentation,hidden),[doc,presentation,hidden]);
  const scale=Math.min(width,height)/300;
  return <SimpleCircularOrLinearView editorName="gin-schnaps-map" sequenceData={sequenceData} width={width} height={height}
    labelSize={13/(1.75*scale*Math.min(1,700/Math.min(width,height)))} annotationHeight={12/scale}
    nameFontSizeCircularView={14/scale} spaceBetweenAnnotations={5/scale} withSelectionEnabled={true} withCaretEnabled={true}
    selectionLayer={toOveSelection(selection,doc.sequence.length)}
    selectionLayerUpdate={(range:OveRange)=>onSelect(fromOveSelection(range,doc.sequence.length,doc.topology==='circular'))}
    annotationVisibility={{features:true,parts:false,primers:false,cutsites:false,translations:false,sequence:false,reverseSequence:false}}
    annotationLabelVisibility={{features:labels,parts:false,primers:false,cutsites:false}}
    showCicularViewInternalLabels={false} noWarnings={true} withChoosePreviewType={false} withDownload={false} withFullscreen={false} withVisibilityOptions={false}/>;
});
type Props = { entry:OpenDocument; onSelect:(s:Selection)=>void; labels:boolean; onCamera?:(c:MapCamera)=>void };
/** Keyed per document/presentation so gestures cannot leak into another tab. */
export function MapView(props:Props) { return <MapViewport key={`${props.entry.key}-${props.entry.presentation}`} {...props}/>; }
function MapViewport({entry,onSelect,labels,onCamera}:Props) {
  const {ref,width,height}=useSize<HTMLDivElement>();
  const initial=entry.mapCameras?.[entry.presentation] ?? FIT_CAMERA;
  const [camera,setCamera]=useState<MapCamera>(initial), current=useRef<MapCamera>(initial);
  const [hand,setHand]=useState(false), [space,setSpace]=useState(false), spaceHeld=useRef(false);
  const [dragging,setDragging]=useState(false), hovered=useRef(false);
  const [error,setError]=useState(''),[exporting,setExporting]=useState(false);
  const canvas=useRef<HTMLDivElement>(null), frame=useRef<number|null>(null);
  const drag=useRef<{id:number;x:number;y:number}|null>(null), suppressClick=useRef(false);
  const selectRef=useRef(onSelect), cameraCallback=useRef(onCamera);
  selectRef.current=onSelect; cameraCallback.current=onCamera;
  const selection=useCallback((s:Selection)=>selectRef.current(s),[]);
  const publish=useCallback(()=>{frame.current=null;setCamera(current.current);cameraCallback.current?.(current.current);},[]);
  const change=useCallback((next:MapCamera)=>{current.current=next;if(frame.current===null)frame.current=requestAnimationFrame(publish);},[publish]);
  const flush=useCallback(()=>{if(frame.current!==null){cancelAnimationFrame(frame.current);frame.current=null;}publish();},[publish]);
  const stop=useCallback(()=>{
    const id=drag.current?.id;drag.current=null;setDragging(false);
    if(id!==undefined && ref.current?.hasPointerCapture(id))ref.current.releasePointerCapture(id);
  },[ref]);
  useEffect(()=>{
    const stage=ref.current;if(!stage)return;
    const wheel=(event:WheelEvent)=>{
      if(document.querySelector('[role="dialog"]') || drag.current || !event.cancelable)return;
      event.preventDefault();
      const box=stage.getBoundingClientRect();
      if(event.shiftKey&&!event.ctrlKey)change(panCamera(current.current,-wheelPixelsX(event,box.height),0));
      else change(wheelCamera(current.current,event.deltaY,event.deltaMode,box.height,{x:event.clientX-box.left-box.width/2,y:event.clientY-box.top-box.height/2}));
    };
    const keydown=(e:KeyboardEvent)=>{
      if(e.code!=='Space'||e.ctrlKey||e.metaKey||e.altKey||document.querySelector('[role="dialog"]'))return;
      const target=e.target as HTMLElement|null;
      if(target?.closest('input,textarea,select,button,[contenteditable="true"]'))return;
      if(hovered.current||stage.contains(document.activeElement)){e.preventDefault();spaceHeld.current=true;setSpace(true);}
    };
    const keyup=(e:KeyboardEvent)=>{if(e.code==='Space'){spaceHeld.current=false;setSpace(false);}};
    const blur=()=>{spaceHeld.current=false;setSpace(false);stop();flush();};
    stage.addEventListener('wheel',wheel,{passive:false});window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',blur);
    return()=>{stage.removeEventListener('wheel',wheel);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',blur);if(frame.current!==null)cancelAnimationFrame(frame.current);};
  },[ref,change,flush,stop]);
  const viewWidth=Math.max(180,width-24),viewHeight=Math.max(150,height-16),scale=Math.min(viewWidth,viewHeight)/300;
  const reset=()=>{stop();change({...FIT_CAMERA});flush();};
  const zoomTo=(z:number)=>change(zoomCamera(current.current,z,{x:0,y:0}));
  const save=async(format:'svg'|'png')=>{const svg=canvas.current?.querySelector('svg');if(!svg)return;setExporting(true);setError('');try{await exportMap(svg,entry.doc,format);}catch(e){setError((e as Error).message);}finally{setExporting(false);}};
  const choices=[.25,.5,.75,1,1.25,1.5,2,3,4,6,8];if(!choices.includes(camera.zoom))choices.push(camera.zoom);choices.sort((a,b)=>a-b);
  return <div className="map-viewport" style={{'--map-unit':`${1/scale}px`} as React.CSSProperties} data-testid="map-view" aria-label={`Map of ${entry.doc.name}`}>
    <div className="map-controls">
      <button aria-label="Zoom out map" onClick={()=>zoomTo(current.current.zoom/1.25)}>−</button>
      <label>Zoom <select aria-label="Map zoom" value={camera.zoom} onChange={e=>zoomTo(Number(e.target.value))}>{choices.map(z=><option key={z} value={z}>{Math.round(z*100)}%</option>)}</select></label>
      <button aria-label="Zoom in map" onClick={()=>zoomTo(current.current.zoom*1.25)}>+</button>
      <button onClick={reset} title="Reset zoom and position (Home)">Fit</button>
      <button aria-label="Pan map" aria-pressed={hand} onClick={()=>{setHand(!hand);stop();}} title="Drag to pan; alternatively Space + drag or middle mouse">Pan</button>
      <span className="flex-spacer"/><button disabled={exporting} onClick={()=>void save('svg')}>Export SVG</button><button disabled={exporting} onClick={()=>void save('png')}>Export PNG</button>
    </div>
    {entry.doc.features.some(f=>f.unresolved)&&<p className="field-note">{entry.doc.features.filter(f=>f.unresolved).length} unresolved feature(s): see Features.</p>}
    {error&&<p className="validation-error" role="status">{error}</p>}
    <div ref={ref} className={`map-camera-stage ${hand||space?'pan-ready':''} ${dragging?'is-panning':''}`} data-testid="map-camera" tabIndex={0}
      data-zoom={camera.zoom} data-pan-x={camera.x} data-pan-y={camera.y}
      aria-label="Map navigation. Wheel zooms at pointer; Space and drag, middle button, or Pan moves the map. Home fits."
      onPointerEnter={()=>{hovered.current=true;}} onPointerLeave={()=>{hovered.current=false;}}
      onPointerDownCapture={e=>{
        if(document.querySelector('[role="dialog"]')||!e.isPrimary)return;
        suppressClick.current=false;
        if(!(e.button===1||(e.button===0&&(hand||spaceHeld.current))))return;
        e.preventDefault();e.stopPropagation();e.currentTarget.focus({preventScroll:true});
        drag.current={id:e.pointerId,x:e.clientX,y:e.clientY};suppressClick.current=true;setDragging(true);e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMoveCapture={e=>{const d=drag.current;if(!d||e.pointerId!==d.id)return;e.preventDefault();e.stopPropagation();change(panCamera(current.current,e.clientX-d.x,e.clientY-d.y));d.x=e.clientX;d.y=e.clientY;}}
      onPointerUpCapture={e=>{if(drag.current?.id!==e.pointerId)return;e.preventDefault();e.stopPropagation();stop();flush();}}
      onPointerCancel={stop} onLostPointerCapture={()=>{drag.current=null;setDragging(false);}}
      onMouseDownCapture={e=>{if(drag.current){e.preventDefault();e.stopPropagation();}}}
      onClickCapture={e=>{if(suppressClick.current){e.preventDefault();e.stopPropagation();suppressClick.current=false;}}}
      onAuxClick={e=>{if(e.button===1){e.preventDefault();e.stopPropagation();}}}
      onDragStart={e=>e.preventDefault()}
      onKeyDown={e=>{if(e.target!==e.currentTarget||e.ctrlKey||e.metaKey||e.altKey)return;
        if(e.key==='Home'||e.key==='0'){e.preventDefault();reset();}
        else if(e.key==='+'||e.key==='='){e.preventDefault();zoomTo(current.current.zoom*1.25);}
        else if(e.key==='-'){e.preventDefault();zoomTo(current.current.zoom/1.25);}
        else if(e.key==='Escape'){stop();spaceHeld.current=false;setSpace(false);setHand(false);}
        else if(e.key.startsWith('Arrow')){e.preventDefault();const step=e.shiftKey?80:20;change(panCamera(current.current,e.key==='ArrowLeft'?-step:e.key==='ArrowRight'?step:0,e.key==='ArrowUp'?-step:e.key==='ArrowDown'?step:0));}
      }}>
      <div className="map-render" ref={canvas} style={{width:viewWidth,height:viewHeight,transform:`translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom}) translate(-50%, -50%)`}}>
        <MapGraphic doc={entry.doc} presentation={entry.presentation} hidden={entry.hiddenFeatures} selection={entry.selection} onSelect={selection} labels={labels} width={viewWidth} height={viewHeight}/>
      </div>
    </div>
  </div>;
}
function wheelPixelsX(e:WheelEvent,height:number):number {
  // Shift+wheel is a horizontal pan on mice and trackpads, not a second zoom gesture.
  const mode=e.deltaMode;
  return (e.deltaX||e.deltaY)*(mode===1?16:mode===2?height:1);
}
