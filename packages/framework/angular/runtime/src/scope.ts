/**
 * Which document a part of the template talks to, and whether it has one:
 *
 *   <div [epdfDocumentScope]="id">       everything inside talks to that document
 *   <epdf-stage *epdfDocumentGate="let document; fallback: opening; locked: locked; error: failed">
 *
 * The gate is a structural directive on purpose: a template really defers creating what's
 * inside, which a conditional `<ng-content>` can't (Angular creates projected content whether
 * or not it's shown). Document UI (the Stage, a page counter) goes behind it; workspace UI (a
 * toolbar frame, an open button) stays outside and renders at once.
 */
import {
  ChangeDetectorRef,
  Directive,
  effect,
  forwardRef,
  inject,
  input,
  TemplateRef,
  untracked,
  ViewContainerRef,
  type EmbeddedViewRef,
} from '@angular/core';
import { documentState, DocumentsToken } from '@embedpdf/core';
import type { DocumentInfo, FailedDocumentInfo, LockedDocumentInfo } from '@embedpdf/core';
import { CapabilityBinding, injectDocumentScope, injectKernelHost } from './capability';
import { EPDF_SCOPED_SERVICES } from './provide';
import { EPDF_DOCUMENT_SCOPE, type EpdfDocumentScopeRef } from './tokens';

/**
 * Binds everything inside the element to one document: services injected there, the Stage
 * and its layers act on it instead of the active document.
 */
@Directive({
  selector: '[epdfDocumentScope]',
  providers: [
    { provide: EPDF_DOCUMENT_SCOPE, useExisting: forwardRef(() => EpdfDocumentScope) },
    // A service injected inside gets an instance of its own here, bound to this document.
    EPDF_SCOPED_SERVICES,
  ],
})
export class EpdfDocumentScope implements EpdfDocumentScopeRef {
  /** The document's id. */
  readonly id = input.required<string>({ alias: 'epdfDocumentScope' });
}

/** What the gate's content gets: `let document` is the ready document. */
export interface EpdfDocumentGateContext {
  $implicit: DocumentInfo;
}

/** What the `locked` template gets: `let-document` is the document waiting for its password. */
export interface EpdfLockedDocumentContext {
  $implicit: LockedDocumentInfo;
}

/** What the `error` template gets: `let-document` is the document that failed, with `error`. */
export interface EpdfFailedDocumentContext {
  $implicit: FailedDocumentInfo;
}

/**
 * Renders its content only while this part of the template has a ready document, with that
 * document as `let document`. Otherwise it renders `locked` for a document waiting for its
 * password, `error` for one that couldn't be opened, and `fallback` for everything else (none
 * open yet, still opening), each with the document as `let-document`. Without `locked` or
 * `error` those states show `fallback` too.
 *
 *   <epdf-stage *epdfDocumentGate="let document; fallback: opening; locked: locked; error: failed">
 *   <ng-template #opening>Opening…</ng-template>
 *   <ng-template #locked let-document><app-password-form [document]="document" /></ng-template>
 *
 * The content stays mounted when another ready document becomes the active one; only its
 * `document` changes.
 */
@Directive({ selector: '[epdfDocumentGate]' })
export class EpdfDocumentGate {
  /** Shown while there is no ready document: none is open, or it's still opening. */
  readonly fallback = input<TemplateRef<unknown> | null | undefined>(null, {
    alias: 'epdfDocumentGateFallback',
  });
  /** Shown while the document waits for its password; `fallback` without it. */
  readonly locked = input<TemplateRef<EpdfLockedDocumentContext> | null | undefined>(null, {
    alias: 'epdfDocumentGateLocked',
  });
  /** Shown when the document couldn't be opened; `fallback` without it. */
  readonly error = input<TemplateRef<EpdfFailedDocumentContext> | null | undefined>(null, {
    alias: 'epdfDocumentGateError',
  });

  static ngTemplateContextGuard(
    _gate: EpdfDocumentGate,
    context: unknown,
  ): context is EpdfDocumentGateContext {
    return true;
  }

  constructor() {
    const document = new CapabilityBinding(
      injectKernelHost('*epdfDocumentGate'),
      () => DocumentsToken,
      injectDocumentScope(),
    ).select(documentState.read, documentState.empty);
    const content = inject<TemplateRef<EpdfDocumentGateContext>>(TemplateRef);
    const container = inject(ViewContainerRef);
    const changes = inject(ChangeDetectorRef);
    let shown: {
      template: TemplateRef<unknown>;
      view: EmbeddedViewRef<{ $implicit: DocumentInfo }>;
    } | null = null;

    effect(() => {
      const current = document();
      const template = this.templateFor(current, content);
      untracked(() => {
        if (shown && shown.template === template) {
          // The same template for another document (a tab switch): keep the view, pass it on.
          shown.view.context.$implicit = current;
          shown.view.markForCheck();
          return;
        }
        container.clear();
        shown = template
          ? { template, view: container.createEmbeddedView(template, { $implicit: current }) }
          : null;
        changes.markForCheck();
      });
    });
  }

  private templateFor(
    document: DocumentInfo,
    content: TemplateRef<EpdfDocumentGateContext>,
  ): TemplateRef<{ $implicit: DocumentInfo }> | null {
    if (document.status === 'ready') return content;
    const locked = this.locked();
    if (document.status === 'locked' && locked)
      return locked as TemplateRef<{ $implicit: DocumentInfo }>;
    const failed = this.error();
    if (document.status === 'error' && failed)
      return failed as TemplateRef<{ $implicit: DocumentInfo }>;
    return (this.fallback() as TemplateRef<{ $implicit: DocumentInfo }> | null | undefined) ?? null;
  }
}
