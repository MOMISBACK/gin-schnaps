import { exportBlob } from '../adapters/desktop';
import { type SequenceDocument } from '../domain/model';
const NS = 'http://www.w3.org/2000/svg';
const STYLE_KEYS = ['fill','fill-opacity','stroke','stroke-width','stroke-opacity','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','font-family','font-size','font-weight','font-style','text-anchor','dominant-baseline','visibility','display','paint-order'];
/** Serialize the current rendered map, never build markup from user-supplied HTML. */
export function serializeMap(svg: SVGSVGElement, doc: SequenceDocument): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = [svg, ...Array.from(svg.querySelectorAll('*'))], copies = [clone, ...Array.from(clone.querySelectorAll('*'))];
  for (let i = 0; i < copies.length; i++) {
    const node = copies[i], original = originals[i];
    const style = getComputedStyle(original);
    node.removeAttribute('style');
    for (const property of STYLE_KEYS) { const value = style.getPropertyValue(property); if (value && !/url\s*\(/i.test(value)) (node as HTMLElement).style.setProperty(property, value); }
    // Responsive custom properties and em sizes are resolved by getComputedStyle.
    for (const attr of Array.from(node.attributes)) if (/^on/i.test(attr.name) || ['href','xlink:href'].includes(attr.name)) node.removeAttribute(attr.name);
  }
  clone.querySelectorAll('script,style,image,iframe,object,embed,animate,set').forEach(n => n.remove());
  for (const foreign of Array.from(clone.querySelectorAll('foreignObject'))) {
    const x = Number(foreign.getAttribute('x') || 0), y = Number(foreign.getAttribute('y') || 0), width = Number(foreign.getAttribute('width') || 0), height = Number(foreign.getAttribute('height') || 0);
    const group = document.createElementNS(NS, 'g');
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', String(x + width / 2)); text.setAttribute('y', String(y + height / 2 - 5)); text.setAttribute('text-anchor','middle'); text.setAttribute('font-family','sans-serif'); text.setAttribute('font-size','9'); text.setAttribute('fill','#202124');
    const name = document.createElementNS(NS, 'tspan'); name.textContent = doc.name; name.setAttribute('x', String(x + width / 2));
    const length = document.createElementNS(NS, 'tspan'); length.textContent = `${doc.sequence.length.toLocaleString('en-US')} bp`; length.setAttribute('x', String(x + width / 2)); length.setAttribute('dy','13');
    text.append(name, length); group.append(text); foreign.replaceWith(group);
  }
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) throw new Error('The map has not finished rendering.');
  clone.setAttribute('xmlns',NS); clone.setAttribute('width', String(Math.round(svg.clientWidth || rect.width))); clone.setAttribute('height', String(Math.round(svg.clientHeight || rect.height)));
  clone.style.background = '#ffffff';
  const title = document.createElementNS(NS,'title'); title.textContent = `${doc.name} — ${doc.sequence.length} bp, ${doc.topology}. Graphical view only; use the native format for sequence data.`;
  clone.insertBefore(title, clone.firstChild);
  return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone);
}
export async function exportMap(svg: SVGSVGElement, doc: SequenceDocument, format: 'svg' | 'png'): Promise<void> {
  const text = serializeMap(svg, doc), safeName = doc.name.replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100) || 'map';
  const blob = new Blob([text], {type:'image/svg+xml;charset=utf-8'});
  if (format === 'svg') { await exportBlob(`${safeName}-map.svg`,blob); return; }
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    await new Promise<void>((resolve,reject) => { image.onload=()=>resolve(); image.onerror=()=>reject(new Error('Unable to rasterize the SVG map. Export SVG instead.')); image.src=url; });
    const factor = 2;
    const width = Math.ceil(image.naturalWidth * factor), height = Math.ceil(image.naturalHeight * factor);
    if (!width || !height || width * height > 32_000_000) throw new Error('PNG is too large. Reduce map dimensions or export SVG.');
    const canvas = document.createElement('canvas'); canvas.width=width; canvas.height=height;
    const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('Canvas is unavailable. Export SVG instead.');
    ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
    const png=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('PNG encoding failed.')),'image/png'));
    await exportBlob(`${safeName}-map.png`,png);
  } finally { URL.revokeObjectURL(url); }
}
