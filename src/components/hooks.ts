import { useEffect, useRef, useState } from 'react';
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 800, height: 500 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const update = () => {
      const { width, height } = node.getBoundingClientRect();
      setSize(old => old.width === width && old.height === height ? old : { width, height });
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(node);
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, []);
  return { ref, ...size };
}
export function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => { const update = () => setWidth(window.innerWidth); window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update); }, []);
  return width;
}
