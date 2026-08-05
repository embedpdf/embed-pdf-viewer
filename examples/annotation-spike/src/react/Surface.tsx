/**
 * The page surface. ONE pointer listener feeds samples (converted to page space
 * via the inverse matrix) into the core; the dumb SceneSvg paints the result.
 * There are no per-shape, per-handle, per-vertex event handlers anywhere.
 */
import { useEffect, useRef } from 'react';
import { Mat2D, apply, compose, invert, scale, translate } from '../core/mat2d';
import { view } from '../core/view';
import { SceneSvg } from './SceneSvg';
import { SelectionMenu } from './SelectionMenu';
import { Store, useModel } from './store';

const PAD = 40;

export function Surface({
  store,
  zoom,
  pageW,
  pageH,
}: {
  store: Store;
  zoom: number;
  pageW: number;
  pageH: number;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  const toView: Mat2D = compose(translate(PAD, PAD), scale(zoom, zoom));
  const viewToPage = invert(toView);
  const W = pageW * zoom + PAD * 2;
  const H = pageH * zoom + PAD * 2;

  const nodes = useModel(store, view);

  useEffect(() => {
    const host = hostRef.current!;
    const toPoint = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      const v = { x: e.clientX - r.left, y: e.clientY - r.top };
      return { view: v, page: apply(viewToPage, v) };
    };
    const env = { toView, handlePx: 10, page: { width: pageW, height: pageH } };
    let dragging = false;

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      const { view: v, page } = toPoint(e);
      store.dispatch({ t: 'pointer', s: { phase: 'down', page, view: v, shift: e.shiftKey }, env });
    };
    const move = (e: PointerEvent) => {
      if (!dragging) return;
      const { view: v, page } = toPoint(e);
      store.dispatch({ t: 'pointer', s: { phase: 'move', page, view: v, shift: e.shiftKey }, env });
    };
    const up = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      const { view: v, page } = toPoint(e);
      store.dispatch({ t: 'pointer', s: { phase: 'up', page, view: v, shift: e.shiftKey }, env });
    };

    host.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      host.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [store, zoom]); // toView/viewToPage depend on zoom

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') store.dispatch({ t: 'cancel' });
      if (e.key === 'Delete' || e.key === 'Backspace') store.dispatch({ t: 'delete' });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  return (
    <div style={{ position: 'relative', width: W, height: H }}>
      <div ref={hostRef} style={{ position: 'absolute', inset: 0, touchAction: 'none' }}>
        <div
          style={{
            position: 'absolute',
            left: PAD,
            top: PAD,
            width: pageW * zoom,
            height: pageH * zoom,
            background: '#fff',
            boxShadow: '0 1px 10px rgba(0,0,0,0.15)',
          }}
        />
        <SceneSvg nodes={nodes} toView={toView} width={W} height={H} />
      </div>
      <SelectionMenu store={store} toView={toView} />
    </div>
  );
}
