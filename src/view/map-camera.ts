/** Screen-space camera only. Never persisted in a sequence document or history. */
export type MapCamera = { zoom: number; x: number; y: number };
export type Point = { x: number; y: number };
export const FIT_CAMERA: Readonly<MapCamera> = Object.freeze({ zoom: 1, x: 0, y: 0 });
export const MIN_MAP_ZOOM = 0.25;
export const MAX_MAP_ZOOM = 8;
export function zoomCamera(camera: MapCamera, requested: number, anchor: Point): MapCamera {
  if (![camera.zoom, camera.x, camera.y, requested, anchor.x, anchor.y].every(Number.isFinite) || camera.zoom <= 0) return camera;
  const zoom = Math.min(MAX_MAP_ZOOM, Math.max(MIN_MAP_ZOOM, requested));
  const ratio = zoom / camera.zoom;
  return { zoom, x: anchor.x - (anchor.x - camera.x) * ratio, y: anchor.y - (anchor.y - camera.y) * ratio };
}
export function panCamera(camera: MapCamera, dx: number, dy: number): MapCamera {
  if (![dx,dy].every(Number.isFinite)) return camera;
  // A numeric safety limit, not an invisible wall at the viewport boundary.
  const bound = (v: number) => Math.max(-1_000_000, Math.min(1_000_000, v));
  return { ...camera, x: bound(camera.x + dx), y: bound(camera.y + dy) };
}
export function wheelPixels(delta: number, mode: number, page: number): number {
  if (!Number.isFinite(delta)) return 0;
  return Math.max(-240, Math.min(240, delta * (mode === 1 ? 16 : mode === 2 ? Math.max(1, page) : 1)));
}
export function wheelCamera(camera: MapCamera, delta: number, mode: number, page: number, anchor: Point): MapCamera {
  return zoomCamera(camera, camera.zoom * Math.exp(-wheelPixels(delta, mode, page) * 0.0025), anchor);
}
