/**
 * `<epdf-page-view>`: one page on its own, with no Stage. A preview in a card, a page picker,
 * the page a comment belongs to:
 *
 *   <epdf-page-view [page]="0" [width]="240">
 *     <epdf-render-layer />
 *   </epdf-page-view>
 *
 * It has no camera, scrolling or zoom, and it doesn't need the Stage plugin: it builds the
 * page's transform from `[width]` and gives the layers between its tags the same page context
 * a Stage's page gives them, so every layer works here as it does on a Stage. With the
 * interaction plugin it takes pointer input for the tools too, so text selection and annotation
 * editing work in it. Anchored UI works as well: it measures the page on screen and is
 * positioned `fixed`, so a card or a scrolling list around the page can't cut it off.
 *
 * What goes between the tags is drawn on the page and turns with it. `<ng-template
 * epdfPageChrome let-page>` draws in the bands `[pageFrame]` reserves around the page and never
 * turns; `<ng-template epdfFallback>` shows until the document and the page are there. `class`
 * and `style` go on the outer box, which is the element itself.
 *
 * The layout is a Stage page's: a shadow that stays put, and a content box with the page's
 * background that turns about its centre (with no transform at all when upright).
 */
import { isPlatformBrowser, NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  contentChild,
  Directive,
  ElementRef,
  inject,
  input,
  PLATFORM_ID,
  signal,
  TemplateRef,
  viewChild,
  type Signal,
} from '@angular/core';
import { shallowEqual, toPageRef } from '@embedpdf/core';
import type { PageInfo, PageRef } from '@embedpdf/core';
import { pageTransform, type PageFrame, type PageTransform } from '@embedpdf/core-geometry';
import { InteractionToken as InteractionHostToken } from '@embedpdf/plugin-interaction/contract/host';
import {
  clientPageProjector,
  observeClientGeometry,
  pageSurfaceLayout,
  pageViewTransformInput,
  paint,
} from '@embedpdf/web';
import {
  CapabilityBinding,
  createPageContext,
  EPDF_DOCUMENT_SCOPE,
  EPDF_PAGE,
  EPDF_SCOPED_SERVICES,
  injectKernelHost,
  type EpdfDocumentScopeRef,
  type EpdfPageContext,
} from '@embedpdf/angular/runtime';
import { EPDF_PROJECTOR, type EpdfProjectorBinding } from '@embedpdf/angular/anchored';
import { EpdfPagePointerSource } from '@embedpdf/angular/interaction';
import { EpdfPageChrome, type EpdfPageTemplateContext } from '@embedpdf/angular/stage';

/**
 * What a page view shows until its document and its page are there, instead of nothing:
 * `<ng-template epdfFallback>Loading…</ng-template>`.
 */
@Directive({ selector: 'ng-template[epdfFallback]' })
export class EpdfFallback {
  readonly template = inject<TemplateRef<unknown>>(TemplateRef);
}

/** Every page view plans its pictures as its own view, so two views of one page never mix. */
let nextViewId = 0;

const frameEqual = (left: PageFrame, right: PageFrame) =>
  left.top === right.top &&
  left.right === right.right &&
  left.bottom === right.bottom &&
  left.left === right.left;

/** The page's box before the content element exists (only a pointer event would ask). */
const NO_RECT = { x: 0, y: 0, left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };

@Component({
  selector: 'epdf-page-view',
  imports: [NgTemplateOutlet, EpdfPagePointerSource],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    // What's inside talks to this view's document, draws on its page, and anchors to it.
    { provide: EPDF_DOCUMENT_SCOPE, useFactory: () => inject(EpdfPageView).documentScope },
    { provide: EPDF_PAGE, useFactory: () => inject(EpdfPageView).pageContext },
    { provide: EPDF_PROJECTOR, useFactory: () => inject(EpdfPageView).projection },
    EPDF_SCOPED_SERVICES,
  ],
  host: {
    style: 'position: relative; display: block',
    '[style.width.px]': 'shown() ? layout().outer.width : null',
    '[style.height.px]': 'shown() ? layout().outer.height : null',
  },
  template: `
    @if (shown()) {
      <!-- The shadow only: axis-aligned, with no fill that could show behind the picture. -->
      <div
        style="position: absolute"
        [style.left.px]="layout().shadow.left"
        [style.top.px]="layout().shadow.top"
        [style.width.px]="layout().shadow.width"
        [style.height.px]="layout().shadow.height"
        [style.box-shadow]="shadow()"
      ></div>
      <!-- The page: its background and its layers as one box, the only thing that turns. -->
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
        <!-- The tools' pointer input comes first, so the layers sit on top of it: a press on a
             layer that lets the pointer through reaches the tools, and a control that takes its
             own presses (a link, a form field) keeps them. -->
        @if (takesPointer()) {
          <epdf-page-pointer-source />
        }
        <ng-content />
      </div>
      <!-- Around the page: fills the outer box, never turns. -->
      @if (chromeTemplate(); as chrome) {
        <ng-container [ngTemplateOutlet]="chrome" [ngTemplateOutletContext]="templateContext" />
      }
    } @else if (fallbackTemplate(); as fallback) {
      <ng-container [ngTemplateOutlet]="fallback" />
    }
  `,
})
export class EpdfPageView {
  /** The page: its `ref`, which follows it when pages move, or its index, from 0. */
  readonly page = input.required<PageRef | number>();
  /**
   * Which document to show. Without it, the one the surrounding `[epdfDocumentScope]` names,
   * else the active one.
   */
  readonly documentId = input<string | null | undefined>(undefined);
  /** The width of the page upright, in pixels: a page turned a quarter is that tall. */
  readonly width = input(240);
  /** Space reserved around the page for your own labels, in pixels per side; 0 for the others. */
  readonly pageFrame = input<Partial<PageFrame> | null | undefined>(undefined);

  private readonly host = injectKernelHost('<epdf-page-view>');
  private readonly parentScope = inject(EPDF_DOCUMENT_SCOPE, { optional: true, skipSelf: true });
  private readonly content = viewChild<ElementRef<HTMLDivElement>>('content');
  private readonly chromeDirective = contentChild(EpdfPageChrome);
  private readonly fallbackDirective = contentChild(EpdfFallback);
  protected readonly chromeTemplate = computed(() => this.chromeDirective()?.template ?? null);
  protected readonly fallbackTemplate = computed(() => this.fallbackDirective()?.template ?? null);

  private readonly activeId = this.host.read(
    (kernel) => kernel.documents.getActiveId(),
    () => null,
  );
  /** The document shown: `[documentId]`, else the scope's, else the active one. */
  private readonly docId = computed(
    () => this.documentId() ?? this.parentScope?.id() ?? this.activeId(),
  );

  /** For what's inside: services and layers talk to the document shown. */
  readonly documentScope: EpdfDocumentScopeRef = { id: this.docId };
  /** The interaction plugin of the document shown, when the viewer has it. */
  private readonly interaction = new CapabilityBinding(
    this.host,
    () => InteractionHostToken,
    this.docId,
  ).capability;

  /**
   * The page's entry in the document, by its object number or its index. Entries stay the
   * same object until their page changes, so a turn or a move reads as a new entry.
   */
  private readonly entry: Signal<PageInfo | null> = this.host.read(
    (kernel) => {
      const id = this.docId();
      if (!id) return null;
      const wanted = this.page();
      const pages = kernel.documents.listPages(id);
      const found =
        typeof wanted === 'number'
          ? pages[wanted]
          : pages.find((page) => page.ref.objectNumber === wanted.objectNumber);
      return found ?? null;
    },
    () => null,
  );

  /** Whether there's a page to show: the document is there and has it. */
  protected readonly shown = computed(() => this.entry() !== null);
  /** Whether the tools take the pointer here: with the interaction plugin, as on a Stage. */
  protected readonly takesPointer = computed(() => this.interaction() !== null);

  private readonly pageIndex = computed(() => {
    const wanted = this.page();
    return this.entry()?.index ?? (typeof wanted === 'number' ? wanted : 0);
  });
  /** The page's object number: a stand-in (its index + 1) only until the page is known. */
  private readonly objectNumber = computed(() => {
    const wanted = this.page();
    return (
      this.entry()?.ref.objectNumber ??
      (typeof wanted === 'number' ? wanted + 1 : wanted.objectNumber)
    );
  });
  /** The same ref object while the page is the same, so layers can key their work on it. */
  private readonly pageRef = computed(() => toPageRef(this.objectNumber()));

  protected readonly frame = computed(
    (): PageFrame => {
      const { top = 0, right = 0, bottom = 0, left = 0 } = this.pageFrame() ?? {};
      return { top, right, bottom, left };
    },
    { equal: frameEqual },
  );

  private readonly dpr = isPlatformBrowser(inject(PLATFORM_ID)) ? window.devicePixelRatio || 1 : 1;
  /** What the transform depends on, by value: a new entry for an unchanged page changes nothing. */
  private readonly geometry = computed(
    () => {
      const entry = this.entry();
      return {
        width: entry?.size.width ?? 1,
        height: entry?.size.height ?? 1,
        rotation: entry?.rotation ?? 0,
        userUnit: entry?.userUnit ?? 1,
        target: this.width(),
        known: entry !== null,
      };
    },
    { equal: shallowEqual },
  );
  /**
   * The page's transform, from the width alone (`pageViewTransformInput` from `@embedpdf/web`,
   * the same in every framework): view pixels per point is `width / page width`, and 100% is 1
   * point = 96/72 CSS pixels times the page's user unit, as on a Stage.
   */
  protected readonly transform: Signal<PageTransform> = computed(() => {
    const { width, height, rotation, userUnit, target, known } = this.geometry();
    const page = known ? { size: { width, height }, rotation, userUnit } : null;
    return pageTransform(pageViewTransformInput(page, target, this.dpr));
  });

  /** The outer box, the shadow at the footprint, and the turned content box. */
  protected readonly layout = computed(() => pageSurfaceLayout(this.transform(), this.frame()));
  /** The viewer's `page` settings; CSS `--epdf-page-shadow` and `--epdf-page-background` win. */
  private readonly look = computed(() => this.host.viewerSettings().page, {
    equal: shallowEqual,
  });
  protected readonly shadow = computed(() => paint('page-shadow', this.look().shadow));
  protected readonly background = computed(() => paint('page-background', this.look().background));

  private readonly viewId = `page-view:${++nextViewId}`;

  /**
   * The page context for the layers inside: one object for the view's lifetime, whose `ref`,
   * `documentId` and signals follow `[page]` and `[documentId]`. No view demand: a page view
   * wants the whole page.
   */
  readonly pageContext: EpdfPageContext = createPageContext({
    documentId: () => this.docId() ?? '',
    ref: () => this.pageRef(),
    view: () => this.viewId,
    pageIndex: this.pageIndex,
    frame: this.frame,
    transform: this.transform,
    getRect: () => this.content()?.nativeElement.getBoundingClientRect() ?? (NO_RECT as DOMRect),
  });

  protected readonly templateContext: EpdfPageTemplateContext = { $implicit: this.pageContext };

  /**
   * How anchored UI inside follows the page: by measuring it on screen. The revision is the
   * page and its transform; a scroll or a resize of the window moves the page without either,
   * so `observeClientGeometry` reports those.
   */
  readonly projection: EpdfProjectorBinding = {
    // `@embedpdf/web`'s measured projector, shared by every framework. It reads the context (and
    // its transform signal) when it projects, so it never goes stale.
    projector: signal(
      clientPageProjector(this.pageContext, () => this.content() !== undefined),
    ).asReadonly(),
    revision: computed(() => [this.pageRef(), this.transform()]),
    shownPages: computed(() => new Set([this.objectNumber()])),
    subscribe: observeClientGeometry,
  };
}
