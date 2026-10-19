/**
 * The templates a Stage draws each page with. React's page function becomes a marker directive
 * on an `<ng-template>`, typed so `let-page` is the page context:
 *
 *   <epdf-stage>
 *     <ng-template epdfPage>              on the page: turns with it (layers)
 *     <ng-template epdfPageChrome>        around the page: never turns (labels, buttons)
 *
 * `let-page` is the same context a component inside the template gets from `injectPage()`.
 */
import { Directive, inject, TemplateRef } from '@angular/core';
import type { EpdfPageContext } from '@embedpdf/angular/runtime';

export interface EpdfPageTemplateContext {
  $implicit: EpdfPageContext;
}

/**
 * What each visible page draws: the render layer, text selection, annotations, your markers.
 * It sits in the page's content box and turns with the page, so positions in it are page
 * coordinates.
 */
@Directive({ selector: 'ng-template[epdfPage]' })
export class EpdfPageTemplate {
  readonly template = inject<TemplateRef<EpdfPageTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfPageTemplate,
    context: unknown,
  ): context is EpdfPageTemplateContext {
    return true;
  }
}

/**
 * What goes around each visible page: a page number, a border, a row of buttons. It fills the
 * page's box with the bands `pageFrame` reserves, and never turns, so a label in the bottom
 * band is `bottom: 0` with `[style.height.px]="page.frame().bottom"`.
 */
@Directive({ selector: 'ng-template[epdfPageChrome]' })
export class EpdfPageChrome {
  readonly template = inject<TemplateRef<EpdfPageTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(
    _directive: EpdfPageChrome,
    context: unknown,
  ): context is EpdfPageTemplateContext {
    return true;
  }
}
