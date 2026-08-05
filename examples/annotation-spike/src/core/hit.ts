/**
 * Pure hit-testing. Given the model + a pointer (page & view space), decide what
 * is under it. Selection chrome (handles, rotate knob) is tested first and in
 * VIEW space so its tolerance is a fixed pixel radius regardless of zoom.
 */
import type { HitEnv, Id, Model } from './model';
import type { Pt } from './mat2d';
import { apply, invert } from './mat2d';
import { HandleRole, KNOB_LOCAL, LOCAL, OPPOSITE, ROLES } from './geom';

export type Target =
  | { t: 'handle'; id: Id; role: HandleRole; anchorLocal: Pt; cornerLocal: Pt }
  | { t: 'rotate'; id: Id }
  | { t: 'shape'; id: Id }
  | { t: 'empty' };

export function hitTest(m: Model, s: { page: Pt; view: Pt }, env: HitEnv): Target {
  const nearPx = (pagePt: Pt): boolean => {
    const v = apply(env.toView, pagePt);
    return Math.hypot(v.x - s.view.x, v.y - s.view.y) <= env.handlePx;
  };

  // 1. handles / rotate knob — only for a single selected annotation
  if (m.selected.length === 1) {
    const a = m.byId[m.selected[0]];
    if (nearPx(apply(a.transform, KNOB_LOCAL))) return { t: 'rotate', id: a.id };
    for (const role of ROLES) {
      if (nearPx(apply(a.transform, LOCAL[role]))) {
        return {
          t: 'handle',
          id: a.id,
          role,
          cornerLocal: LOCAL[role],
          anchorLocal: LOCAL[OPPOSITE[role]],
        };
      }
    }
  }

  // 2. annotation bodies, top-most first (invert the placement, test the unit shape)
  for (let i = m.order.length - 1; i >= 0; i--) {
    const a = m.byId[m.order[i]];
    const lp = apply(invert(a.transform), s.page);
    const inside =
      a.kind === 'square'
        ? Math.abs(lp.x) <= 0.5 && Math.abs(lp.y) <= 0.5
        : lp.x * lp.x + lp.y * lp.y <= 0.25;
    if (inside) return { t: 'shape', id: a.id };
  }

  return { t: 'empty' };
}
