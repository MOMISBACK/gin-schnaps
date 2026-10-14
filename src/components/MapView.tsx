import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { SimpleCircularOrLinearView } from '@teselagen/ove';
import { fromOveSelection, toOveDocument, toOveSelection, type OveRange } from '../adapters/coordinates';
import { type OpenDocument } from '../domain/workspace';
import { type Selection } from '../domain/model';
import { exportMap } from '../view/map-export';
import { FIT_CAMERA, MAX_MAP_ZOOM, MIN_MAP_ZOOM, panMap, wheelZoom, zoomMap, type MapCamera } from '../view/map-camera';
import { useSize } from './hooks';

/** Key the camera by document and presentation: navigation never leaks to another
 * molecule, and is not an edit, a rotation of the origin, or a file property. */
export function MapView(props: { entry: OpenDocument; onSelect: (s: Selection) => void; labels: boolean }) {
  return <MapCanvas key={`${props.entry.key}-${props.entry.presentation}`} {...props}/>;
}
function MapCanvas({ entry, onSelect, labels }: { entry: OpenDocument; onSelect: (s: Selection) => void; labels: boolean }) {
  const { ref: viewport, width, height } = useSize<HTMLDivElement>();
  const [camera, setCamera] = useState<MapCamera>(FIT_CAMERA), cameraRef = useRef<MapCamera>(FIT_CAMERA);
  const [panMode, setPanMode] = useState(false), [space, setSpace] = useState(false), [panning, setPanning] = useState(false);
  const [error, setError] = useState(''), [exporting, setExporting] = useState(false);
  const hovered = useRef(false);
  const spaceHeld = useRef(false), canvas = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null), suppressClick = useRef(false);
  const viewWidth = Math.max(240, width), viewHeight = Math.max(180, height);
  const scale = Math.min(viewWidth, viewHeight) / 300;
  const sequenceData = useMemo(() => toOveDocument(entry.doc, entry.presentation, entry.hiddenFeatures), [entry.doc, entry.presentation, entry.hiddenFeatures]);
  const update = useCallback((next: MapCamera) => { cameraRef.current = next; setCamera(next); }, []);
  const endPan = useCallback(() => {
    const id = gesture.current?.id;
    gesture.current = null; setPanning(false);
    if (id !== undefined && viewport.current?.hasPointerCapture(id)) viewport.current.releasePointerCapture(id);
  }, []);
  const fit = () => { endPan(); update({ ...FIT_CAMERA }); };
  useEffect(() => { update({ ...FIT_CAMERA }); }, [viewWidth, viewHeight, update]);
  useEffect(() => {
    const node = viewport.current; if (!node) return;
    // React's delegated wheel listener may be passive. Only this viewport owns
    // the non-passive listener, not the page, toolbar, or another scroll panel.
    const wheel = (event: WheelEvent) => {
      if (document.querySelector('[role="dialog"]') || !event.cancelable || gesture.current) return;
      event.preventDefault(); event.stopPropagation();
      const rect = node.getBoundingClientRect();
      update(zoomMap(cameraRef.current, wheelZoom(cameraRef.current.zoom, event.deltaY, event.deltaMode, rect.height),
        { x: event.clientX - rect.left, y: event.clientY - rect.top }));
    };
    const reset = () => { spaceHeld.current = false; setSpace(false); endPan(); };
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.code !== 'Space' || event.ctrlKey || event.metaKey || event.altKey || document.querySelector('[role="dialog"]')) return;
      if (target instanceof Element && target.closest('input,textarea,select,[contenteditable="true"],[data-edit-mode="typing"]')) return;
      if (hovered.current || node.contains(document.activeElement)) { event.preventDefault(); spaceHeld.current = true; setSpace(true); }
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') { spaceHeld.current = false; setSpace(false); } };
    node.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', reset);
    return () => { node.removeEventListener('wheel', wheel); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', reset); };
  }, [update, endPan]);
  const save = async (format: 'svg' | 'png') => {
    const svg = canvas.current?.querySelector('svg'); if (!svg) return;
    setExporting(true); setError('');
    try { await exportMap(svg, entry.doc, format); } catch (e) { setError((e as Error).message); } finally { setExporting(false); }
  };
  const zoomAtCenter = (value: number) => update(zoomMap(cameraRef.current, value, { x: width / 2, y: height / 2 }));
  const presets = [.25, .5, .75, 1, 1.25, 1.5, 2, 3, 4, 6, 8];
  return <div className="map-viewport" style={{ '--map-unit': `${1 / scale}px` } as React.CSSProperties} data-testid="map-view" aria-label={`Map of ${entry.doc.name}`}>
    <div className="map-controls">
      <button aria-label="Zoom map out" disabled={camera.zoom <= MIN_MAP_ZOOM} onClick={() => zoomAtCenter(camera.zoom / 1.25)}>−</button>
      <label>Zoom <select aria-label="Map zoom" value={camera.zoom} onChange={e => zoomAtCenter(Number(e.target.value))}>
        {!presets.includes(camera.zoom) && <option value={camera.zoom}>{Math.round(camera.zoom * 100)}%</option>}
        {presets.map(z => <option key={z} value={z}>{z * 100}%</option>)}
      </select></label>
      <button aria-label="Zoom map in" disabled={camera.zoom >= MAX_MAP_ZOOM} onClick={() => zoomAtCenter(camera.zoom * 1.25)}>+</button>
      <button onClick={fit} title="Fit and recenter the complete map (0)">Fit</button>
      <button aria-label="Pan map" aria-pressed={panMode} className={panMode ? 'map-hand-active' : ''} onClick={() => { endPan(); setPanMode(!panMode); }} title="Hand tool: drag to pan. Otherwise use middle drag or Space + left drag.">
        Pan
      </button>
      <span className="flex-spacer"/>
      <button disabled={exporting} onClick={() => void save('svg')}>Export SVG</button><button disabled={exporting} onClick={() => void save('png')}>Export PNG</button>
    </div>
    {entry.doc.features.some(f => f.unresolved) && <p className="field-note">{entry.doc.features.filter(f => f.unresolved).length} unresolved feature(s) are listed under Features, not drawn as exact locations.</p>}
    {error && <p className="validation-error" role="status">{error}</p>}
    <div className={`map-scroll map-navigation ${panMode || space ? 'pan-ready' : ''} ${panning ? 'is-panning' : ''}`} ref={viewport} tabIndex={0}
      data-testid="map-navigation" data-zoom={camera.zoom} data-pan-x={camera.x} data-pan-y={camera.y}
      aria-label="Map navigation. Wheel to zoom, Space or middle drag to pan, 0 to fit."
      onKeyDown={event => {
        if (event.target !== event.currentTarget || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.code === 'Space') { event.preventDefault(); spaceHeld.current = true; setSpace(true); }
        else if (event.key === '0') { event.preventDefault(); fit(); }
        else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomAtCenter(cameraRef.current.zoom * 1.25); }
        else if (event.key === '-') { event.preventDefault(); zoomAtCenter(cameraRef.current.zoom / 1.25); }
        else if (event.key === 'Escape') { endPan(); spaceHeld.current = false; setSpace(false); setPanMode(false); }
        else if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {
          event.preventDefault(); update(panMap(cameraRef.current, event.key === 'ArrowLeft' ? -30 : event.key === 'ArrowRight' ? 30 : 0,
            event.key === 'ArrowUp' ? -30 : event.key === 'ArrowDown' ? 30 : 0));
        }
      }}
      onPointerEnter={() => { hovered.current = true; }} onPointerLeave={() => { hovered.current = false; }}
      onPointerDownCapture={event => {
        if (document.querySelector('[role="dialog"]') || gesture.current) return;
        suppressClick.current = false;
        event.currentTarget.focus({ preventScroll: true });
        if (!(event.button === 1 || (event.button === 0 && (panMode || spaceHeld.current)))) return;
        event.preventDefault(); event.stopPropagation();
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        suppressClick.current = true; setPanning(true); event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMoveCapture={event => {
        const drag = gesture.current; if (!drag || drag.id !== event.pointerId) return;
        event.preventDefault(); event.stopPropagation();
        update(panMap(cameraRef.current, event.clientX - drag.x, event.clientY - drag.y));
        drag.x = event.clientX; drag.y = event.clientY;
      }}
      onPointerUpCapture={event => {
        // Even after pointer cancellation, prevent Linux middle-button paste.
        if (event.button === 1 || gesture.current?.id === event.pointerId) { event.preventDefault(); event.stopPropagation(); endPan(); }
      }}
      onPointerCancel={endPan} onLostPointerCapture={endPan}
      onClickCapture={event => { if (panMode || suppressClick.current) { event.preventDefault(); event.stopPropagation(); } }}
      onMouseDownCapture={event => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); } }}
      onMouseUpCapture={event => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); } }}
      onAuxClickCapture={event => { if (event.button === 1) { event.preventDefault(); event.stopPropagation(); } }}
      onDragStart={event => event.preventDefault()}>
      <div className="map-render" ref={canvas} style={{ width: viewWidth, height: viewHeight, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})` }}>
        <SimpleCircularOrLinearView editorName="gin-schnaps-map" sequenceData={sequenceData} width={viewWidth} height={viewHeight}
          labelSize={13 / (1.75 * scale * Math.min(1, 700 / Math.min(viewWidth, viewHeight)))}
          annotationHeight={12 / scale} nameFontSizeCircularView={14 / scale} spaceBetweenAnnotations={5 / scale}
          withSelectionEnabled={true} withCaretEnabled={true}
          selectionLayer={toOveSelection(entry.selection, entry.doc.sequence.length)}
          selectionLayerUpdate={(range: OveRange) => { if (!gesture.current && !panMode && !spaceHeld.current) onSelect(fromOveSelection(range, entry.doc.sequence.length, entry.doc.topology === 'circular')); }}
          annotationVisibility={{ features: true, parts: false, primers: false, cutsites: false, translations: false, sequence: false, reverseSequence: false }}
          annotationLabelVisibility={{ features: labels, parts: false, primers: false, cutsites: false }}
          showCicularViewInternalLabels={false} noWarnings={true} withChoosePreviewType={false} withDownload={false} withFullscreen={false} withVisibilityOptions={false}/>
      </div>
    </div>
  </div>;
}
