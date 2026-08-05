/**
 * `<epdf-viewer>` — component-hosted kernel (framework parity with React's
 * `<Viewer>`). Provides `EpdfKernelHost` at its element injector, boots it, and
 * projects content UNCONDITIONALLY: it is NOT a gate. Angular instantiates
 * projected content eagerly whether or not a slot renders it, so a conditional
 * `<ng-content>` cannot defer anything — real gating belongs to templates the
 * APP owns: `@if (ready())` for boot chrome, `*epdfDocumentGate` (or
 * `@if (documentId())`) for document UI.
 *
 * Prefer `provideEmbedPdf(...)` at route/app level when chrome lives outside
 * one subtree; this component is sugar over the same host.
 */
import { ChangeDetectionStrategy, Component, inject, input, type OnInit } from '@angular/core';
import type { AnyPlugin, Engine, EngineFactory } from '@embedpdf/core';
import { EpdfKernelHost, type EpdfInitialDocument } from './kernel-host';

@Component({
  selector: 'epdf-viewer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EpdfKernelHost],
  // Layout-transparent, like React's element-less <Viewer>.
  host: { style: 'display: contents;' },
  template: `<ng-content />`,
})
export class EpdfViewer implements OnInit {
  /** The engine, as an instance OR a thunk ({@link EngineFactory}). An
   *  instance is borrowed (never destroyed here); a thunk is host-owned
   *  (constructed then destroyed with the viewer). See EmbedPdfConfig.
   *  Init-only: the kernel is built once from the first values; recreate the
   *  viewer (e.g. with @if) to swap it. */
  readonly engine = input.required<Engine | EngineFactory>();
  readonly plugins = input.required<AnyPlugin[]>();
  readonly initialDocuments = input<EpdfInitialDocument[]>();

  /** The host this viewer provides — exposed so a template reference can read
   *  `viewer.host.ready()` / `.status()` without extra imports. */
  readonly host = inject(EpdfKernelHost, { self: true });

  constructor() {
    // Deferred config: inputs are READ on first kernel access, which happens
    // after construction (a template binding or effect) — never here.
    this.host.connect(() => ({
      engine: this.engine(),
      plugins: this.plugins(),
      initialDocuments: this.initialDocuments(),
    }));
  }

  ngOnInit(): void {
    // Inputs are set by now; materializes the kernel and starts it (no-op on
    // the server — the SSR contract lives on the host).
    this.host.boot();
  }
}
