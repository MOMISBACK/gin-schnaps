/** Clipboard support without native filesystem/clipboard permissions or polling. */
export function isTextEntry(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (
    target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement || target.isContentEditable
  );
}
export function hasSelectedText(): boolean {
  return Boolean(window.getSelection()?.toString());
}
export async function writeClipboardText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return; }
    catch { /* User-triggered fallback for WebViews that expose but deny the API. */ }
  }
  const previous = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea');
  area.value = text; area.className = 'clipboard-helper'; area.setAttribute('aria-label', 'Clipboard copy buffer');
  document.body.appendChild(area);
  try {
    area.focus(); area.select();
    if (!document.execCommand('copy')) throw new Error('The browser refused clipboard access.');
  } finally {
    area.remove();
    if (previous?.isConnected) previous.focus({ preventScroll: true });
  }
}
