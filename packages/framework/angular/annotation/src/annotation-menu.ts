/**
 * Your UI next to annotations, inside `<epdf-stage>`, each on `<epdf-anchored>`, so it moves
 * with the pages in the same frame and a click in it never reaches the page:
 *
 *   <epdf-annotation-menu>                   your menu next to the selection
 *   <epdf-annotation-draft-menu #menu>       buttons over a polygon being drawn (`menu.draft()`)
 *   <epdf-annotation-rotation-badge>         the angle next to the pointer while turning
 *
 * They only place things: what's in them is yours, built from `inject(EpdfAnnotation)`.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  inject,
  input,
  type Signal,
} from '@angular/core';
import {
  CapabilityBinding,
  injectDocumentScope,
  injectKernelHost,
  outsideStageError,
} from '@embedpdf/angular/runtime';
import {
  EPDF_PROJECTOR,
  EpdfAnchored,
  type AnchoredPlacement,
  type EpdfAnchor,
} from '@embedpdf/angular/anchored';
import type { AnnotationRotationAnchor, CreationDraft } from '@embedpdf/plugin-annotation';
import {
  AnnotationToken as AnnotationHostToken,
  type AnnotationHostCapability,
} from '@embedpdf/plugin-annotation/contract/host';
import {
  paint,
  paintDefault,
  sameCreationDraftAnchor,
  sameRotationAnchor,
  sameSelectionAnchor,
} from '@embedpdf/web';
import { injectChromeSettings } from './settings';
import { EpdfRotationBadgeTemplate } from './templates';

/** The annotation plugin of the document this part of the template talks to. */
function annotationInScope(what: string): CapabilityBinding<AnnotationHostCapability> {
  return new CapabilityBinding<AnnotationHostCapability>(
    injectKernelHost(what),
    () => AnnotationHostToken,
    injectDocumentScope(),
  );
}

/**
 * Your menu next to the selection: one menu, also for a selection over several pages, clear of
 * the rotation handle. It hides while the selection is dragged, resized or turned. Put it inside
 * `<epdf-stage>`, next to the page template, with what the menu holds between its tags:
 *
 *   <epdf-annotation-menu placement="bottom">
 *     <button (click)="annotation.selection.delete()">Delete</button>
 *   </epdf-annotation-menu>
 */
@Component({
  selector: 'epdf-annotation-menu',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="anchor()" [placement]="placement()" [gap]="gap()">
      <ng-content />
    </epdf-anchored>
  `,
})
export class EpdfAnnotationMenu {
  /** Which side of the selection: `'top'` (the default), `'bottom'`, `'left'` or `'right'`, or a corner. */
  readonly placement = input<AnchoredPlacement>('top');
  /** Screen pixels between the selection and the menu. */
  readonly gap = input(15);

  private readonly annotation = annotationInScope('<epdf-annotation-menu>');
  private readonly projection = inject(EPDF_PROJECTOR, { optional: true });

  /**
   * The selection's anchor as its page is shown: the rotation handle sits a fixed number of
   * pixels off the box, so where it is on the page depends on the zoom. Read again with the
   * projection, in the same pass as the pages.
   */
  private readonly selection = this.annotation.select(
    (annotation) => {
      const anchor = annotation.selection.getAnchor();
      if (!anchor) return null;
      this.projection?.revision();
      const view = this.projection?.projector()?.viewEnv(anchor.page);
      return view ? annotation.getSelectionAnchorIn(view) : anchor;
    },
    null,
    sameSelectionAnchor,
  );

  protected readonly anchor = computed((): EpdfAnchor | null => {
    const anchor = this.selection();
    if (!anchor) return null;
    return {
      page: anchor.page,
      bounds: anchor.bounds,
      ...(anchor.rotationHandle ? { avoid: [anchor.rotationHandle] } : {}),
    };
  });

  constructor() {
    if (!this.projection) throw outsideStageError('<epdf-annotation-menu>');
  }
}

/**
 * Buttons over a polygon or polyline being drawn, which helps on touch screens. `draft()` is the
 * shape being drawn (`pointCount`, `minPoints`, `canFinish`, …), or null; the verbs are the
 * annotation service's `draft.finish()` and `draft.cancel()`:
 *
 *   <epdf-annotation-draft-menu #menu="epdfAnnotationDraftMenu">
 *     <button [disabled]="!menu.draft()?.canFinish" (click)="annotation.draft.finish()">Done</button>
 *   </epdf-annotation-draft-menu>
 */
@Component({
  selector: 'epdf-annotation-draft-menu',
  exportAs: 'epdfAnnotationDraftMenu',
  imports: [EpdfAnchored],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <epdf-anchored [anchor]="draft()" [placement]="placement()" [gap]="gap()">
      <ng-content />
    </epdf-anchored>
  `,
})
export class EpdfAnnotationDraftMenu {
  /** Which side of the shape being drawn. */
  readonly placement = input<AnchoredPlacement>('top');
  /** Screen pixels between the shape and the menu. */
  readonly gap = input(8);

  private readonly annotation = annotationInScope('<epdf-annotation-draft-menu>');

  /** The shape being drawn: where it is, its points so far and whether it can end; or null. */
  readonly draft: Signal<CreationDraft | null> = this.annotation.select(
    (annotation) => annotation.draft.get(),
    null,
    sameCreationDraftAnchor,
  );

  constructor() {
    if (!inject(EPDF_PROJECTOR, { optional: true })) {
      throw outsideStageError('<epdf-annotation-draft-menu>');
    }
  }
}

/**
 * The angle next to the pointer while a selection is turned, upright however the page is shown.
 * It shows the angle in the `chrome.readout` colors when `chrome.readout.enabled`; give it an
 * `<ng-template epdfRotationBadge let-rotation>` to draw it your way. `rotation()` is the turn
 * in progress (`page`, `at`, `angle`), or null.
 */
@Component({
  selector: 'epdf-annotation-rotation-badge',
  exportAs: 'epdfAnnotationRotationBadge',
  imports: [EpdfAnchored, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shown(); as rotation) {
      <epdf-anchored [anchor]="anchor()" [placement]="placement()" [gap]="gap()">
        @if (custom(); as custom) {
          <ng-container
            [ngTemplateOutlet]="custom.template"
            [ngTemplateOutletContext]="{ $implicit: rotation }"
          />
        } @else {
          <div
            style="pointer-events: none; white-space: nowrap; border-radius: 4px; padding: 2px 6px; font-size: 12px"
            [style.font-family]="fontFamily"
            [style.background]="background()"
            [style.color]="color()"
          >
            {{ rotation.angle }}°
          </div>
        }
      </epdf-anchored>
    }
  `,
})
export class EpdfAnnotationRotationBadge {
  /** Which side of the pointer. */
  readonly placement = input<AnchoredPlacement>('right');
  /** Screen pixels between the pointer and the badge. */
  readonly gap = input(16);

  private readonly annotation = annotationInScope('<epdf-annotation-rotation-badge>');
  private readonly settings = injectChromeSettings();
  protected readonly custom = contentChild(EpdfRotationBadgeTemplate);

  /** The turn in progress: its page, the pointer's point and the angle so far; or null. */
  readonly rotation: Signal<AnnotationRotationAnchor | null> = this.annotation.select(
    (annotation) => annotation.selection.getRotationAnchor(),
    null,
    sameRotationAnchor,
  );

  /** Shown while turning, with a template of yours or with the readout on. */
  protected readonly shown = computed(() => {
    const rotation = this.rotation();
    return rotation && (this.custom() || this.settings.chrome().readout.enabled) ? rotation : null;
  });
  /** A box of no size at the pointer. */
  protected readonly anchor = computed((): EpdfAnchor | null => {
    const rotation = this.rotation();
    return rotation
      ? { page: rotation.page, bounds: { ...rotation.at, width: 0, height: 0 } }
      : null;
  });
  protected readonly fontFamily = paintDefault('font-mono');
  protected readonly background = computed(() =>
    paint('readout-background', this.settings.chrome().readout.background),
  );
  protected readonly color = computed(() =>
    paint('readout-color', this.settings.chrome().readout.color),
  );

  constructor() {
    if (!inject(EPDF_PROJECTOR, { optional: true })) {
      throw outsideStageError('<epdf-annotation-rotation-badge>');
    }
  }
}
