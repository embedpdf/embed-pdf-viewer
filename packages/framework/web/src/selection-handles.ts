/**
 * Selection-handle DOM binding — the listener mechanics of dragging one
 * handle element, shared by every framework adapter (the policy — geometry
 * and the drag session — lives in `@embedpdf/plugin-selection`'s pure
 * `handles` module; this file never imports it, per the layering law:
 * structural interfaces only).
 *
 * The load-bearing subtlety this module owns: the pointer-DOWN shield must be
 * a NATIVE listener. The stage's gesture controller listens natively on the
 * container, so a framework-synthetic stopPropagation (React runs its
 * handlers at the root, AFTER the container's native ones) would be too late
 * — the stage would already be panning underneath the handle drag. Once the
 * down is captured here, movement tracks by CLIENT DELTAS from the handle's
 * own base point: no DOM geometry reads, and the client↔overlay conversion
 * cancels out.
 */

interface SurfacePoint {
  x: number;
  y: number;
}

/** The armed drag the adapter hands back — plugin-selection's
 *  `SelectionHandleDragSession` satisfies it. */
export interface SelectionHandleSession {
  move(overlay: SurfacePoint): void;
  end(): void;
}

export interface AttachSelectionHandleOptions {
  /**
   * Called at pointer-down to arm a drag: return the drag session plus the
   * handle's current BASE point in overlay space (the bar's midpoint — the
   * point the user grabbed). Return null to decline (endpoint vanished, page
   * not laid out) — the press then does nothing and nothing is captured.
   */
  arm(): { base: SurfacePoint; session: SelectionHandleSession } | null;
}

/** Bind one handle element. Returns the detach fn. */
export function attachSelectionHandle(
  el: HTMLElement,
  options: AttachSelectionHandleOptions,
): () => void {
  let active: {
    session: SelectionHandleSession;
    base: SurfacePoint;
    baseClient: SurfacePoint;
    pointerId: number;
  } | null = null;

  const onMove = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.pointerId) return;
    active.session.move({
      x: active.base.x + (e.clientX - active.baseClient.x),
      y: active.base.y + (e.clientY - active.baseClient.y),
    });
  };
  // Release and system-cancel settle identically: the selection's own commit
  // semantics live in the session; there is no half-state to revert here.
  const onUp = (e: PointerEvent) => {
    if (!active || e.pointerId !== active.pointerId) return;
    const s = active.session;
    active = null;
    s.end();
  };
  const onDown = (e: PointerEvent) => {
    if (active) return;
    const armed = options.arm();
    if (!armed) return;
    e.preventDefault();
    e.stopPropagation(); // native: fires BEFORE the stage controller's listener
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // best-effort, like the scrollbar: an already-released pointer
      // (pen/touch races, synthetic events in tests) throws — the drag must
      // still arm, and the window-less capture path still delivers to `el`.
    }
    active = {
      session: armed.session,
      base: armed.base,
      baseClient: { x: e.clientX, y: e.clientY },
      pointerId: e.pointerId,
    };
  };

  el.addEventListener('pointerdown', onDown);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  return () => {
    el.removeEventListener('pointerdown', onDown);
    el.removeEventListener('pointermove', onMove);
    el.removeEventListener('pointerup', onUp);
    el.removeEventListener('pointercancel', onUp);
    active = null;
  };
}
