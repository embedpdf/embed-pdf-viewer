/**
 * INTERNAL page shell — one per visible page, tracked by `pon` so the instance
 * (and everything below) survives camera motion and page reorders.
 *
 * THE STABILITY INVARIANT (see page-context.ts): `page` (the context) and
 * `pageInjector` are created ONCE per surface. Camera frames arrive as new
 * `vp` input values; only the signals inside the context change. Changing the
 * injector or context object identity would make `NgTemplateOutlet` recreate
 * the embedded views — destroying layers at 120Hz. Don't.
 *
 * Geometry mirrors React's PageSurface: the outer box = content footprint +
 * reserved chrome bands; the shadow is axis-aligned and stays put under
 * rotation; the content wrapper is the ONLY thing rotation turns, and carries
 * no transform at rotation 0 so it pixel-snaps like the shadow behind it.
 * All numbers come from the transform — never re-derive `* zoom` / `* dpr`.
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
import type { PageFrame, VisiblePage } from '@embedpdf/plugin-stage';
import { createPageContext, EPDF_PAGE, type EpdfPageContext } from '@embedpdf/angular/runtime';
import type { EpdfPageTemplateContext } from './templates';

@Component({
  selector: 'epdf-page-surface',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    style: 'position: absolute; display: block;',
    '[style.left.px]': 'left()',
    '[style.top.px]': 'top()',
    '[style.width.px]': 'outerWidth()',
    '[style.height.px]': 'outerHeight()',
  },
  template: `
    <!-- drop shadow ONLY — axis-aligned at the content box (inset by the frame),
         transparent fill so it can never peek out behind the bitmap, and it
         stays put under rotation. -->
    <div
      style="position: absolute; box-shadow: var(--epdf-page-shadow, 0 6px 18px rgba(0, 0, 0, 0.18));"
      [style.left.px]="frame().left"
      [style.top.px]="frame().top"
      [style.width.px]="t().viewWidth"
      [style.height.px]="t().viewHeight"
    ></div>
    <!-- the page: white backing + content as ONE box — the only thing rotation
         turns. We render our own selection highlights, so native selection is
         suppressed on the whole page subtree. -->
    <div
      #content
      style="position: absolute; background: #fff; user-select: none; -webkit-user-select: none;"
      [style.left.px]="contentLeft()"
      [style.top.px]="contentTop()"
      [style.width.px]="t().contentWidth"
      [style.height.px]="t().contentHeight"
      [style.transform]="rotate()"
    >
      <ng-container
        [ngTemplateOutlet]="pageTpl()"
        [ngTemplateOutletContext]="templateContext"
        [ngTemplateOutletInjector]="pageInjector"
      />
    </div>
    <!-- box-space chrome — fills the outer box, NEVER rotates. Bands are plain
         regions: a label is bottom: 0; height: frame().bottom. -->
    @if (chromeTpl(); as chrome) {
      <ng-container
        [ngTemplateOutlet]="chrome"
        [ngTemplateOutletContext]="templateContext"
        [ngTemplateOutletInjector]="pageInjector"
      />
    }
  `,
})
export class EpdfPageSurface {
  readonly vp = input.required<VisiblePage>();
  readonly frame = input.required<PageFrame>();
  readonly documentId = input.required<string>();
  readonly pageTpl = input.required<TemplateRef<EpdfPageTemplateContext>>();
  readonly chromeTpl = input<TemplateRef<EpdfPageTemplateContext> | null>(null);

  protected readonly t = computed(() => this.vp().transform);

  // Outer box = display footprint + reserved chrome bands; screenX/screenY are
  // the device-snapped footprint top-left, so the box sits one frame further out.
  protected readonly left = computed(() => this.vp().screenX - this.frame().left);
  protected readonly top = computed(() => this.vp().screenY - this.frame().top);
  protected readonly outerWidth = computed(
    () => this.t().viewWidth + this.frame().left + this.frame().right,
  );
  protected readonly outerHeight = computed(
    () => this.t().viewHeight + this.frame().top + this.frame().bottom,
  );
  // Center the (possibly rotated) content box on the display box and rotate
  // about its center — NO translate(), so rotation 0 carries no transform.
  protected readonly contentLeft = computed(
    () => this.frame().left + (this.t().viewWidth - this.t().contentWidth) / 2,
  );
  protected readonly contentTop = computed(
    () => this.frame().top + (this.t().viewHeight - this.t().contentHeight) / 2,
  );
  protected readonly rotate = computed(() => {
    const rotation = this.vp().rotation;
    return rotation ? `rotate(${rotation}deg)` : null;
  });

  private readonly contentEl = viewChild.required<ElementRef<HTMLDivElement>>('content');

  /** ONE stable context per surface — volatile parts are signals inside it. */
  readonly page: EpdfPageContext = createPageContext({
    documentId: () => this.documentId(),
    pon: () => this.vp().pon,
    pageIndex: computed(() => this.vp().pageIndex),
    frame: this.frame,
    transform: this.t,
    getRect: () => this.contentEl().nativeElement.getBoundingClientRect(),
  });

  /** ONE stable injector per surface (see the invariant above), parented to
   *  this surface's node injector so layers also reach the kernel host. */
  protected readonly pageInjector = Injector.create({
    providers: [{ provide: EPDF_PAGE, useValue: this.page }],
    parent: inject(Injector),
  });

  protected readonly templateContext: EpdfPageTemplateContext = { $implicit: this.page };
}
