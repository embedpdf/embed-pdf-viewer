/**
 * The render-prop translation: React's `children: (page) => ReactNode` becomes
 * marker directives on `<ng-template>`, typed so `let-page` infers
 * `EpdfPageContext` in the template.
 *
 *   <epdf-stage>
 *     <ng-template epdfPage>            page-space content (rotates)
 *     <ng-template epdfPageChrome>      box-space chrome (never rotates)
 *
 * The `$implicit` context is the SAME stable object the per-page injector
 * provides as `EPDF_PAGE` — `let-page` is sugar for inline chrome; components
 * inside the template just call `injectPage()`.
 */
import { Directive, inject, TemplateRef } from '@angular/core';
import type { EpdfPageContext } from '@embedpdf/angular/runtime';

export interface EpdfPageTemplateContext {
  $implicit: EpdfPageContext;
}

/** PAGE-SPACE content for each visible page (RenderLayer, annotations,
 *  markers). Rendered inside the page's content frame, so it ROTATES with the
 *  page's display rotation — coordinates are plain PDF points. */
@Directive({ selector: 'ng-template[epdfPage]', standalone: true })
export class EpdfPageTemplate {
  readonly template = inject<TemplateRef<EpdfPageTemplateContext>>(TemplateRef);
  static ngTemplateContextGuard(
    _dir: EpdfPageTemplate,
    ctx: unknown,
  ): ctx is EpdfPageTemplateContext {
    return true;
  }
}

/** BOX-SPACE chrome for each visible page (page-number label, selection
 *  border, per-page buttons). Rendered into the OUTER box (content + reserved
 *  `pageFrame`), so it does NOT rotate and the reserved bands are plain
 *  regions (`bottom: 0; height: page.frame().bottom`). */
@Directive({ selector: 'ng-template[epdfPageChrome]', standalone: true })
export class EpdfPageChrome {
  readonly template = inject<TemplateRef<EpdfPageTemplateContext>>(TemplateRef);
  static ngTemplateContextGuard(
    _dir: EpdfPageChrome,
    ctx: unknown,
  ): ctx is EpdfPageTemplateContext {
    return true;
  }
}
