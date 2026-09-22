/**
 * A page address — structurally the kernel's `PageRef` from `@embedpdf/core`
 * (`{ kind: 'objectNumber', pageObjectNumber }`), mirrored here like the
 * rect/point shapes so this package stays free of EmbedPDF imports. Every
 * `PageRef` the kernel or a plugin hands out satisfies it; the surfaces pass
 * it through untouched (a stage's `pageAt` result, an anchor's page) — the
 * number is never read here.
 */
export interface PageRef {
  readonly kind: 'objectNumber';
  readonly pageObjectNumber: number;
}
