/**
 * Viewport-space chrome: a floating menu. It anchors to whichever edge of the
 * selection is OPPOSITE the rotate knob, so the two never overlap — knob at the
 * bottom → menu on top; rotate the shape far enough that the knob clears the top
 * edge → menu flips to the bottom. Stays visible (and follows) during a move;
 * hides during rotate / resize / marquee / create. Reads the model, calls intents.
 */
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { Mat2D, apply, compose, translate } from '../core/mat2d';
import { Model } from '../core/model';
import { KNOB_LOCAL, boundsOf, unionBounds } from '../core/geom';
import { Store, useModel } from './store';

interface Placement {
  x: number;
  y: number;
  side: 'top' | 'bottom';
}

function placeMenu(m: Model, toView: Mat2D): Placement | null {
  if (!m.selected.length) return null;
  const d = m.draft;
  if (d && d.g !== 'move') return null; // keep it only for move; hide for rotate/resize/marquee/create

  // effective transform — follow the live move delta so the menu tracks the shape
  const eff = (id: string): Mat2D => {
    if (d && d.g === 'move' && d.ids.includes(id))
      return compose(translate(d.delta.x, d.delta.y), m.byId[id].transform);
    return m.byId[id].transform;
  };

  const b = unionBounds(m.selected.map((id) => boundsOf(eff(id))));
  const cx = (b.min.x + b.max.x) / 2;

  // Flip only once the knob has actually cleared the top edge of the box.
  let side: 'top' | 'bottom' = 'top';
  if (m.selected.length === 1) {
    const knob = apply(eff(m.selected[0]), KNOB_LOCAL);
    side = knob.y < b.min.y ? 'bottom' : 'top';
  }

  const at = apply(toView, { x: cx, y: side === 'top' ? b.min.y : b.max.y });
  return { x: at.x, y: at.y, side };
}

export function SelectionMenu({ store, toView }: { store: Store; toView: Mat2D }) {
  const model = useModel(store, (m) => m);
  const place = placeMenu(model, toView);
  if (!place) return null;

  const stop = (e: ReactPointerEvent) => e.stopPropagation();
  return (
    <div
      onPointerDown={stop}
      style={{
        position: 'absolute',
        left: place.x,
        top: place.side === 'top' ? place.y - 46 : place.y + 12,
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: 4,
        padding: 4,
        background: '#222',
        borderRadius: 8,
        boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
      }}
    >
      <button title="Rotate 90°" style={btn} onClick={() => store.dispatch({ t: 'rotate90' })}>
        ⟳
      </button>
      <button title="Delete" style={btn} onClick={() => store.dispatch({ t: 'delete' })}>
        ✕
      </button>
    </div>
  );
}

const btn: CSSProperties = {
  background: '#3a3a3a',
  color: '#fff',
  border: 'none',
  borderRadius: 6,
  width: 30,
  height: 30,
  cursor: 'pointer',
  fontSize: 15,
  lineHeight: '30px',
};
