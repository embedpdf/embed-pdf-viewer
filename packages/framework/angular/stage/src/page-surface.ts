/**
 * One page on a Stage: its box, its shadow, its turned content, and the page and chrome
 * templates drawn into them. The Stage tracks surfaces by the page's object number, so a
 * surface (and every layer in it) lives while its page is on screen, through camera moves and
 * page reorders.
 *
 * The page context and the injector that provides it are made once per surface; camera frames
 * arrive as new `visiblePage` input values and change only the signals inside the context. A
 * new context or injector would make the template outlet recreate every layer on every frame.
 *
 * The geometry is every framework's (`pageSurfaceLayout` from `@embedpdf/web`): the outer box
 * is the page's footprint plus the reserved chrome bands; the shadow is axis-aligned and stays
 * put when the page turns; only the content box turns, and at rotation 0 it carries no
 * transform, so it snaps to pixels like the shadow behind it. Every number comes from the page
 * transform.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { toPageRef } from '@embedpdf/core';
import type { PageRef, ViewerPageSettings } from '@embedpdf/core';
import type { PageFrame } from '@embedpdf/core-geometry';
import type { VisiblePage } from '@embedpdf/plugin-stage';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import { pageSurfaceLayout, paint, stagePageDemand } from '@embedpdf/web';
import { createPageContext, EPDF_PAGE, type EpdfPageContext } from '@embedpdf/angular/runtime';
import type { EpdfPageTemplateContext } from './templates';

@Component({
  selector: 'epdf-page-surface',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'position: absolute; display: block;',
    '[style.left.px]': 'layout().outer.left',
    '[style.top.px]': 'layout().outer.top',
    '[style.width.px]': 'layout().outer.width',
    '[style.height.px]': 'layout().outer.height',
  },
  template: `
    <!-- The shadow only: axis-aligned at the content box, with no fill that could show behind
         the picture, and it stays put when the page turns. -->
    <div
      style="position: absolute"
      [style.left.px]="layout().shadow.left"
      [style.top.px]="layout().shadow.top"
      [style.width.px]="layout().shadow.width"
      [style.height.px]="layout().shadow.height"
      [style.box-shadow]="shadow()"
    ></div>
    <!-- The page: its background and content as one box, the only thing that turns. The layers
         draw their own selection, so the browser's is off for the whole page. -->
    <div
      #content
      style="position: absolute; user-select: none; -webkit-user-select: none"
      [style.left.px]="layout().content.left"
      [style.top.px]="layout().content.top"
      [style.width.px]="layout().content.width"
      [style.height.px]="layout().content.height"
      [style.background]="background()"
      [style.transform]="layout().turn"
    >
      <ng-container
        [ngTemplateOutlet]="pageTemplate()"
        [ngTemplateOutletContext]="templateContext"
        [ngTemplateOutletInjector]="pageInjector"
      />
    </div>
    <!-- Around the page: fills the outer box, never turns. -->
    @if (chromeTemplate(); as chrome) {
      <ng-container
        [ngTemplateOutlet]="chrome"
        [ngTemplateOutletContext]="templateContext"
        [ngTemplateOutletInjector]="pageInjector"
      />
    }
  `,
})
export class EpdfPageSurface {
  readonly visiblePage = input.required<VisiblePage>();
  /** The bands reserved around the page, in screen pixels. */
  readonly frame = input.required<PageFrame>();
  readonly documentId = input.required<string>();
  /** The Stage's view; the tile demand reads what's on screen from it when asked. */
  readonly stage = input.required<StageHostCapability>();
  /** The viewer's `page` settings: the background and the shadow. */
  readonly look = input.required<ViewerPageSettings>();
  readonly pageTemplate = input.required<TemplateRef<EpdfPageTemplateContext>>();
  readonly chromeTemplate = input<TemplateRef<EpdfPageTemplateContext> | null>(null);

  protected readonly transform = computed(() => this.visiblePage().transform);

  // The outer box, the shadow and the turned content box, from `@embedpdf/web`'s layout, shared
  // by every framework; screenX/screenY are the footprint's device-snapped corner.
  protected readonly layout = computed(() => {
    const visiblePage = this.visiblePage();
    return pageSurfaceLayout(this.transform(), this.frame(), {
      x: visiblePage.screenX,
      y: visiblePage.screenY,
    });
  });
  // The settings, unless CSS sets `--epdf-page-shadow` or `--epdf-page-background`.
  protected readonly shadow = computed(() => paint('page-shadow', this.look().shadow));
  protected readonly background = computed(() => paint('page-background', this.look().background));

  private readonly content = viewChild.required<ElementRef<HTMLDivElement>>('content');
  private pageRef: PageRef | null = null;

  /** The page context, one for the surface's lifetime. */
  readonly page: EpdfPageContext = createPageContext({
    documentId: () => this.documentId(),
    // The Stage builds a new ref each frame; the surface keeps the first, so layers can key
    // their work on it.
    ref: () => (this.pageRef ??= toPageRef(this.visiblePage().ref.objectNumber)),
    view: () => this.stage().getLensId(),
    pageIndex: computed(() => this.visiblePage().pageIndex),
    frame: this.frame,
    transform: this.transform,
    getRect: () => this.content().nativeElement.getBoundingClientRect(),
    // Read live from the Stage: off screen, the page wants nothing (an empty rect).
    getViewDemand: () =>
      stagePageDemand(
        this.stage(),
        this.visiblePage().ref.objectNumber,
        this.transform().deviceWidth,
      ),
  });

  /** One injector for the surface's lifetime, under this surface, so layers reach the viewer too. */
  protected readonly pageInjector = Injector.create({
    providers: [{ provide: EPDF_PAGE, useValue: this.page }],
    parent: inject(Injector),
  });

  protected readonly templateContext: EpdfPageTemplateContext = { $implicit: this.page };
}
