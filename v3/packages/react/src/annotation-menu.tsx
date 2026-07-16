/**
 * <AnnotationMenu> — the DEFAULT, Stage-bound selection menu.
 *
 * Marker-style: it transforms the selected content rect through the Stage camera
 * and renders an upright menu in viewport space. Mount it in the Stage `overlay`
 * slot. It re-renders on `visiblePages()`, so it tracks pan/zoom and page
 * rotation/layout changes with no DOM measurement, no portal, no scroll listeners.
 *
 * This module is the ONLY annotation menu that imports `@embedpdf-x/plugin-stage`.
 * For a Stage-free `<PageView>`, use `<PageAnnotationMenu>` from
 * `@embedpdf-x/react/annotation` instead.
 */
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { StageToken } from '@embedpdf-x/plugin-stage';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf-x/plugin-annotation/internal';
import { useCapability, useSelector } from './runtime';
import {
  sameAnchor,
  sameCreationDraftAnchor,
  useAnnotationSelected,
  type AnnotationDraftMenuProps,
  type AnnotationMenuProps,
} from './annotation';
import { positionMenuAroundRect } from './annotation-menu-position';

export function AnnotationMenu({ children, gap = 15, placement = 'top' }: AnnotationMenuProps) {
  const stage = useCapability(StageToken);
  const anno = useCapability(AnnotationHostToken);
  // Reposition on pan/zoom AND rotation/layout changes. `visiblePages()` folds in
  // the scene key, camera, viewport, and DPR, while staying referentially stable.
  useSelector(StageToken, (c) => c.visiblePages());
  // Two-step anchor resolve: the pon comes from the scale-less anchor, then the
  // knob is re-projected with THAT page's view scale so the menu dodges the knob
  // where it actually renders (screen-constant stalk).
  const anchor = useSelector(
    AnnotationHostToken,
    (c) => {
      const a = c.selectionAnchor();
      if (!a) return null;
      const t = stage.pageRect(a.pon)?.transform;
      return t?.viewScale ? c.selectionAnchor(t.viewScale, t.rotation, t.zoom) : a;
    },
    sameAnchor,
  );
  const selected = useAnnotationSelected();

  // Isolate the menu from the Stage's pointer forwarding: a pointerdown inside it
  // must NOT bubble up to the Stage container's NATIVE listener, which would
  // forward to the interaction hub and read it as a click-outside → deselect (and
  // unmount this menu). Native listener (not React's) so it runs during real DOM
  // bubbling, before the Stage's own native listener on the ancestor. Inner button
  // `onClick` still fires — `click` is a separate event that reaches React's root.
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  });

  if (!anchor) return null;
  const box = stage.pageRectToScreen(anchor.pon, anchor.bounds);
  if (!box) return null;
  // Transform the knob via a zero-size rect so page rotation is respected; the
  // menu then nudges only the edge it sits on (and only if the knob protrudes).
  const kr = anchor.knob
    ? stage.pageRectToScreen(anchor.pon, {
        x: anchor.knob.x,
        y: anchor.knob.y,
        width: 0,
        height: 0,
      })
    : null;
  const pos = positionMenuAroundRect(box, placement, gap, kr ? { x: kr.x, y: kr.y } : null);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        transform: pos.transform,
        pointerEvents: 'auto',
      }}
    >
      {children({
        selected,
        deleteSelection: anno.deleteSelection,
        deselect: anno.deselect,
        updateSelection: anno.updateSelection,
        rotate90: anno.rotateSelection90,
        resetRotation: anno.resetSelectionRotation,
        group: anno.group,
        ungroup: anno.ungroup,
        canGroup: anno.canGroup(),
        canUngroup: anno.canUngroup(),
      })}
    </div>
  );
}

export function AnnotationDraftMenu({
  children,
  gap = 8,
  placement = 'top',
}: AnnotationDraftMenuProps) {
  const stage = useCapability(StageToken);
  const anno = useCapability(AnnotationHostToken);
  useSelector(StageToken, (c) => c.visiblePages());
  const anchor = useSelector(
    AnnotationHostToken,
    (c) => c.creationDraftAnchor(),
    sameCreationDraftAnchor,
  );

  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stop = (e: Event) => e.stopPropagation();
    el.addEventListener('pointerdown', stop);
    return () => el.removeEventListener('pointerdown', stop);
  });

  if (!anchor) return null;
  const box = stage.pageRectToScreen(anchor.pon, anchor.bounds);
  if (!box) return null;
  const pos = positionMenuAroundRect(box, placement, gap);
  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: pos.left,
        top: pos.top,
        transform: pos.transform,
        pointerEvents: 'auto',
      }}
    >
      {children({
        ...anchor,
        finish: anno.finishCreationDraft,
        cancel: anno.cancelCreationDraft,
      })}
    </div>
  );
}
