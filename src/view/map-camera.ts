/** Screen-only camera. Never stored in a scientific document or its history. */
export type MapCamera = { zoom: number; x: number; y: number };
export const MIN_MAP_ZOOM = 0.25;
export const MAX_MAP_ZOOM = 8;
export const FIT_CAMERA: MapCamera = { zoom: 1, x: 0, y: 0 };
const finite = (...values: number[]) => values.every(Number.isFinite);
export function zoomMap(camera: MapCamera, requested: number, anchor: { x: number; y: number }): MapCamera {
  if (!finite(camera.zoom, camera.x, camera.y, requested, anchor.x, anchor.y) || camera.zoom <= 0) return camera;
  const zoom = Math.max(MIN_MAP_ZOOM, Math.min(MAX_MAP_ZOOM, requested));
  if (zoom === camera.zoom) return camera;
  const ratio = zoom / camera.zoom;
  return { zoom, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio };
}
export function panMap(camera: MapCamera, dx: number, dy: number): MapCamera {
  if (!finite(dx, dy, camera.x, camera.y)) return camera;
  // A numerical guard, not a constraint keeping the map inside the viewport.
  return { ...camera, x: Math.max(-1e6, Math.min(1e6, camera.x + dx)), y: Math.max(-1e6, Math.min(1e6, camera.y + dy)) };
}
export function wheelZoom(zoom: number, deltaY: number, deltaMode: number, viewportHeight: number): number {
  if (!finite(zoom, deltaY, viewportHeight)) return zoom;
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? Math.max(1, viewportHeight) : 1;
  return zoom * Math.exp(-Math.max(-300, Math.min(300, deltaY * unit)) * 0.002);
}
