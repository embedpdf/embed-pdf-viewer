/**
 * Document scoping — hierarchical DI is Angular's native React-context.
 *
 * `[epdfDocumentScope]` binds a subtree to a SPECIFIC document (panes,
 * comparison); `*epdfDocumentGate` renders a subtree only WHILE it has one.
 * The gate is a structural directive on purpose: a template genuinely defers
 * creation, which a conditional `<ng-content>` slot cannot (Angular
 * instantiates projected content eagerly). Document-scoped UI — the Stage,
 * zoom/page controls, panels — belongs behind it (or behind the app's own
 * `@if (documentId())`); workspace chrome lives outside it.
 */
import {
  computed,
  Directive,
  effect,
  forwardRef,
  inject,
  input,
  TemplateRef,
  ViewContainerRef,
} from '@angular/core';
import { injectDocumentId } from './inject';
import { EPDF_DOCUMENT_SCOPE, type EpdfDocumentScopeRef } from './tokens';

@Directive({
  selector: '[epdfDocumentScope]',
  standalone: true,
  providers: [{ provide: EPDF_DOCUMENT_SCOPE, useExisting: forwardRef(() => EpdfDocumentScope) }],
})
export class EpdfDocumentScope implements EpdfDocumentScopeRef {
  readonly id = input.required<string>({ alias: 'epdfDocumentScope' });
}

/**
 * Render the host template only while this subtree has a document — the
 * structural way to say "this UI is defined over a document". Sibling of
 * `[epdfDocumentScope]`, which picks WHICH document; this one handles WHETHER.
 *
 *   <section *epdfDocumentGate="; fallback: empty">…document UI…</section>
 *   <ng-template #empty>Drop a PDF to get started</ng-template>
 *
 * The subtree stays mounted across a CHANGE of document (active-tab switch) —
 * only the has-a-document boolean creates/destroys it.
 */
@Directive({ selector: '[epdfDocumentGate]', standalone: true })
export class EpdfDocumentGate {
  /** Shown while this subtree has NO document (empty workspace, docs still opening). */
  readonly fallback = input<TemplateRef<unknown> | null>(null, {
    alias: 'epdfDocumentGateFallback',
  });

  constructor() {
    const docId = injectDocumentId();
    const hasDocument = computed(() => docId() !== null);
    const container = inject(ViewContainerRef);
    const content = inject<TemplateRef<unknown>>(TemplateRef);
    effect(() => {
      container.clear();
      if (hasDocument()) {
        container.createEmbeddedView(content);
      } else {
        // `fallback` is only tracked while gated — swapping fallback templates
        // never recreates live document UI.
        const fallbackTemplate = this.fallback();
        if (fallbackTemplate) container.createEmbeddedView(fallbackTemplate);
      }
    });
  }
}
