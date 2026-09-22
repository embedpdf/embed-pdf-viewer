/**
 * Annotation menus — thin anchor plumbing over the one `<Anchored>` primitive.
 *
 * These work identically under `<Stage>` (mount in the overlay slot; the
 * camera projects, no DOM reads) and `<PageView>` (measured + portalled) —
 * the surface provides the projector, the menu doesn't care.
 *
 * No action bags: actions come from the capability hooks (`useAnnotation()`,
 * `useAnnotationSelected()`, …), which subscribe properly and compose across
 * plugins. Render props carry only the anchor'S data (the draft menu's
 * progress facts); the annotation-selection menu takes plain children.
 */
import * as React from 'react';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import type { CreationDraftAnchor } from '@embedpdf/core-annotation';
import { Anchored, useProjectorBinding, type AnchoredPlacement } from './anchored';
import { useSelector } from './runtime';
import { sameAnchor, sameCreationDraftAnchor } from './annotation-anchors';

export interface AnnotationMenuProps {
  children: React.ReactNode;
  /** Gap in screen px between the selection box and the menu (default 15). */
  gap?: number;
  /** Where to place the menu relative to the selection box. Default 'top'. */
  placement?: AnchoredPlacement;
}

/**
 * Floats over the current annotation selection (one anchor regardless of
 * cross-page selection), dodging the rotate knob. Compose the contents from
 * hooks: `useAnnotation()` for the verbs, `useAnnotationSelected()` /
 * `useSelectionProps()` for the data.
 */
export function AnnotationMenu({ children, gap = 15, placement = 'top' }: AnnotationMenuProps) {
  // Reading the binding subscribes this component to projection changes
  // (its identity is the revision), so the anchor read below re-runs with
  // fresh view facts in the same commit as the surface — the knob offset is
  // screen-constant, so its content-space position depends on the page's
  // live view scale.
  const { projector } = useProjectorBinding();
  const anchor = useSelector(
    AnnotationToken,
    (annotation) => {
      const selectionAnchor = annotation.getSelectionAnchor();
      if (!selectionAnchor) return null;
      const env = projector.viewEnv(selectionAnchor.page);
      return env ? annotation.getSelectionAnchor(env) : selectionAnchor;
    },
    sameAnchor,
  );
  if (!anchor) return null;
  return (
    <Anchored
      anchor={{
        page: anchor.page,
        bounds: anchor.bounds,
        ...(anchor.knob ? { avoid: [anchor.knob] } : {}),
      }}
      placement={placement}
      gap={gap}
    >
      {children}
    </Anchored>
  );
}

export interface AnnotationDraftMenuProps {
  /** Render prop receiving the draft anchor'S data (subtype, pointCount,
   *  minPoints, canFinish, …). The verbs are capability calls:
   *  `useAnnotation().finishCreationDraft()` / `.cancelCreationDraft()`. */
  children: (anchor: CreationDraftAnchor) => React.ReactNode;
  /** Gap in screen px between the draft anchor and the menu (default 8). */
  gap?: number;
  /** Where to place the menu relative to the draft anchor. Default 'top'. */
  placement?: AnchoredPlacement;
}

/** Floats over a live multi-click creation draft (polygon, polyline, …). */
export function AnnotationDraftMenu({
  children,
  gap = 8,
  placement = 'top',
}: AnnotationDraftMenuProps) {
  const anchor = useSelector(
    AnnotationToken,
    (annotation) => annotation.getCreationDraft(),
    sameCreationDraftAnchor,
  );
  if (!anchor) return null;
  return (
    <Anchored anchor={anchor} placement={placement} gap={gap}>
      {children(anchor)}
    </Anchored>
  );
}
