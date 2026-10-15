import { MAX_FRAGMENT_BYTES, parseFragment, type AnnotatedFragment } from '../domain/annotated-fragment';
export const FRAGMENT_MIME = 'application/x-gin-schnaps-fragment+json';
const ATTRIBUTE = 'data-gin-schnaps-fragment';
const encode = (s: string) => { const bytes = new TextEncoder().encode(s); let b = ''; for (let i = 0; i < bytes.length; i += 8192) b += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(b); };
const decode = (s: string) => { if (s.length > MAX_FRAGMENT_BYTES * 1.4) throw new Error('Annotated clipboard HTML is too large.'); const b = atob(s); return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(b, c => c.charCodeAt(0))); };
export function fragmentHTML(fragment: AnnotatedFragment): string {
  return `<pre ${ATTRIBUTE}="${encode(JSON.stringify(fragment))}">${fragment.sequence}</pre>`;
}
/** Parse inert data only; the original HTML is never injected into the application. */
export function fragmentFromClipboard(data: Pick<DataTransfer, 'getData'>): AnnotatedFragment | null {
  const custom = data.getData(FRAGMENT_MIME), html = data.getData('text/html');
  const text = data.getData('text/plain');
  let fragment: AnnotatedFragment | null = null;
  if (custom) fragment = parseFragment(custom);
  else if (html.toLowerCase().includes(ATTRIBUTE)) {
    if (html.length > MAX_FRAGMENT_BYTES * 2) throw new Error('Annotated clipboard HTML is too large.');
    // Read only our bounded base64 attribute. Never instantiate arbitrary HTML,
    // resource elements or network-bearing markup from an external clipboard.
    const values = Array.from(html.matchAll(/\sdata-gin-schnaps-fragment\s*=\s*["']([A-Za-z0-9+/=]+)["']/gi));
    if (values.length !== 1) throw new Error('Ambiguous annotated clipboard content.');
    fragment = parseFragment(decode(values[0][1]));
  }
  if (fragment && text.trim().replace(/\s/g, '').toUpperCase() !== fragment.sequence) throw new Error('Clipboard bases and annotation payload disagree. Paste was refused.');
  return fragment;
}
/** One user-triggered copy event writes both mandatory OS formats. Custom MIME is
 * supplemental: clipboard implementations may remove it or sanitize the HTML. */
export async function writeAnnotatedClipboard(fragment: AnnotatedFragment): Promise<void> {
  const html = fragmentHTML(fragment), previous = document.activeElement as HTMLElement | null;
  const area = document.createElement('textarea'); area.className = 'clipboard-helper'; area.value = fragment.sequence;
  let delivered = false;
  const copy = (event: ClipboardEvent) => {
    if (!event.clipboardData) return;
    event.preventDefault(); event.stopImmediatePropagation();
    event.clipboardData.clearData();
    event.clipboardData.setData('text/plain', fragment.sequence);
    event.clipboardData.setData('text/html', html);
    try { event.clipboardData.setData(FRAGMENT_MIME, JSON.stringify(fragment)); } catch { /* HTML/explicit session fallback remains. */ }
    delivered = true;
  };
  document.addEventListener('copy', copy, true); document.body.appendChild(area);
  try {
    area.focus(); area.select();
    if (!document.execCommand('copy') || !delivered) throw new Error('System clipboard copy was refused. Use the explicitly labelled session fragment instead; nothing was cut.');
  } finally { document.removeEventListener('copy', copy, true); area.remove(); if (previous?.isConnected) previous.focus({ preventScroll: true }); }
}
