/**
 * Annotation menus: thin anchor plumbing over the one `<Anchored>` primitive.
 * They come from `/annotation`; this module stays apart so it doesn't pull
 * in the layer.
 *
 * These work identically under `<Stage>` (mount in the overlay slot; the
 * camera projects, no DOM reads) and `<PageView>` (measured and portalled):
 * the surface provides the projector, the menu doesn't care.
 *
 * No action bags: actions come from `useAnnotation()` and the state hooks,
 * which subscribe properly and compose across plugins. Render props carry
 * only the anchor's data (the draft menu's progress); the selection menu
 * takes plain children.
 */
import * as React from 'react';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import type { CreationDraftAnchor, RotationAnchor } from '@embedpdf/core-annotation';
import {
  paint,
  paintDefault,
  sameCreationDraftAnchor,
  sameRotationAnchor,
  sameSelectionAnchor,
} from '@embedpdf/web';
import { Anchored, useProjectorBinding, type AnchoredPlacement } from './anchored';
import { useAnnotationSettings } from './annotation-hooks';
import { useOptionalSelector } from './runtime';

export interface AnnotationMenuProps {
  children: React.ReactNode;
  /** Gap in screen px between the selection box and the menu (default 15). */
  gap?: number;
  /** Where to place the menu relative to the selection box. Default 'top'. */
  placement?: AnchoredPlacement;
}

/**
 * Your own menu next to the selection (one anchor, also for a selection over
 * several pages), clear of the rotation handle. It hides while the selection
 * is dragged, resized or turned. What's in it is yours: build it from
 * `useAnnotation()` and `useAnnotationState()`.
 */
export function AnnotationMenu({ children, gap = 15, placement = 'top' }: AnnotationMenuProps) {
  // Reading the binding subscribes this component to projection changes
  // (its identity is the revision), so the anchor read below re-runs with
  // fresh view facts in the same commit as the surface: the rotation
  // handle's offset is screen-constant, so its page-space position depends
  // on the page's live view scale.
  const { projector } = useProjectorBinding();
  const anchor = useOptionalSelector(
    AnnotationHostToken,
    (annotation) => {
      const selectionAnchor = annotation.selection.getAnchor();
      if (!selectionAnchor) return null;
      const env = projector.viewEnv(selectionAnchor.page);
      return env ? annotation.getSelectionAnchorIn(env) : selectionAnchor;
    },
    null,
    sameSelectionAnchor,
  );
  if (!anchor) return null;
  return (
    <Anchored
      anchor={{
        page: anchor.page,
        bounds: anchor.bounds,
        ...(anchor.rotationHandle ? { avoid: [anchor.rotationHandle] } : {}),
      }}
      placement={placement}
      gap={gap}
    >
      {children}
    </Anchored>
  );
}

export interface AnnotationDraftMenuProps {
  /** Render prop receiving the shape being drawn (`subtype`, `pointCount`,
   *  `minPoints`, `canFinish`, …). The verbs are capability calls:
   *  `useAnnotation().draft.finish()` and `.draft.cancel()`. */
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
  const anchor = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.draft.get(),
    null,
    sameCreationDraftAnchor,
  );
  if (!anchor) return null;
  return (
    <Anchored anchor={anchor} placement={placement} gap={gap}>
      {children(anchor)}
    </Anchored>
  );
}

export interface AnnotationRotationBadgeProps {
  /** Render prop receiving the rotation in progress (`angle`, degrees
   *  clockwise, as the commit will apply it). Without it, the badge shows the
   *  angle in the `chrome.readout` colors, when `chrome.readout.enabled`. */
  children?: (rotation: RotationAnchor) => React.ReactNode;
  /** Gap in screen px between the pointer and the badge (default 16). */
  gap?: number;
  /** Where to place the badge relative to the pointer. Default 'right'. */
  placement?: AnchoredPlacement;
}

/**
 * Follows the pointer while a selection is being turned, upright however the
 * page is shown: it floats over the page like the menus, not in it. Shows
 * nothing when no rotation is in progress.
 */
export function AnnotationRotationBadge({
  children,
  gap = 16,
  placement = 'right',
}: AnnotationRotationBadgeProps) {
  const rotation = useOptionalSelector(
    AnnotationToken,
    (annotation) => annotation.selection.getRotationAnchor(),
    null,
    sameRotationAnchor,
  );
  const readout = useAnnotationSettings((settings) => settings.chrome.readout);
  if (!rotation || (!children && !readout.enabled)) return null;
  return (
    <Anchored
      anchor={{ page: rotation.page, bounds: { ...rotation.at, width: 0, height: 0 } }}
      placement={placement}
      gap={gap}
    >
      {children ? (
        children(rotation)
      ) : (
        <div
          style={{
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            borderRadius: 4,
            padding: '2px 6px',
            fontFamily: paintDefault('font-mono'),
            fontSize: 12,
            background: paint('readout-background', readout.background),
            color: paint('readout-color', readout.color),
          }}
        >
          {rotation.angle}°
        </div>
      )}
    </Anchored>
  );
}
