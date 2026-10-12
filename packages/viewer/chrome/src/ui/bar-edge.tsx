/**
 * Where a bar is, for what opens from it. The shell wraps each bar it draws in
 * a `BarEdgeProvider` naming the viewer edge the bar sits on; a menu (and the
 * toolbar's own "More") reads it with `useBarEdge()` and opens away from that
 * edge: a bottom bar's menus open upward, a start bar's to the side, a
 * floating bar's toward the middle of the viewer.
 *
 * A floating bar names the half of the viewer it floats in (`float-top`,
 * `float-bottom`), since its menus open toward the other half. Outside any
 * provider the edge is `'top'`, the main bar's.
 */
import { createContext, useContext } from 'react';

/** The viewer edge a bar sits on; a floating bar names the half it floats in. */
export type BarEdge = 'top' | 'bottom' | 'start' | 'end' | 'float-top' | 'float-bottom';

export const BarEdgeContext = createContext<BarEdge>('top');

/** Names the edge of the bar drawn inside it. */
export const BarEdgeProvider = BarEdgeContext.Provider;

/** The edge of the bar this component is drawn in (`'top'` outside any bar). */
export function useBarEdge(): BarEdge {
  return useContext(BarEdgeContext);
}
