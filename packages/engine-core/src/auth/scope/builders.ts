import type { DocCapability, PdfBits } from './types';

/**
 * Typed capability constants for customer-side JWT minting.
 *
 * The shape mirrors the dotted capability name so it reads naturally:
 *   caps.doc.text.copy()                  // "doc.text.copy"
 *   caps.doc.download()                   // "doc.download"
 *   caps.doc.download.flattened()         // "doc.download.flattened"
 *   caps.doc.print.high()                 // "doc.print.high"
 *
 * Each leaf is a function returning the literal string (as `const`) so
 * TypeScript catches typos at the call site. Wrappers like `download`
 * and `print` are `Object.assign`'d to be callable AND carry child
 * properties for the refinement capabilities.
 */
export const caps = {
  doc: {
    open: () => 'doc.open' as const,
    render: () => 'doc.render' as const,
    text: {
      select: () => 'doc.text.select' as const,
      copy: () => 'doc.text.copy' as const,
      search: () => 'doc.text.search' as const,
    },
    content: {
      copy: () => 'doc.content.copy' as const,
    },
    download: Object.assign(() => 'doc.download' as const, {
      flattened: () => 'doc.download.flattened' as const,
    }),
    print: Object.assign(() => 'doc.print' as const, {
      high: () => 'doc.print.high' as const,
    }),
    pages: {
      modify: () => 'doc.pages.modify' as const,
      assemble: () => 'doc.pages.assemble' as const,
    },
    forms: {
      read: () => 'doc.forms.read' as const,
      fill: () => 'doc.forms.fill' as const,
      modify: () => 'doc.forms.modify' as const,
    },
    annotate: {
      read: () => 'doc.annotate.read' as const,
      modify: () => 'doc.annotate.modify' as const,
    },
    metadata: {
      modify: () => 'doc.metadata.modify' as const,
    },
    attachments: {
      modify: () => 'doc.attachments.modify' as const,
    },
    redact: () => 'doc.redact' as const,
  },
} as const;

/**
 * Builder factory for collab scope filters. Each entity:action pair
 * gets a sub-object with the four filter constructors.
 *
 *   collab.annotations.create.self()           → "annotations:create:self"
 *   collab.annotations.create.group("legal")   → "annotations:create:group=legal"
 *   collab.annotations.update.group("4")       → "annotations:update:group=4"
 *   collab.annotations.delete.createdBy("u-7") → "annotations:delete:createdBy=u-7"
 *   collab.annotations.setGroup.group("legal") → "annotations:set-group:group=legal"
 *   collab.annotations.all.all()               → "annotations:*:all"  (action wildcard)
 *
 * On create, the filter is evaluated against the caller's own identity
 * (no impersonation), so `:self` and `:all` trivially pass; `:group=X`
 * is the meaningful filter — it constrains creation to callers whose
 * default group is X.
 */
export const collab = {
  annotations: {
    create: makeFilterBuilder('annotations', 'create'),
    update: makeFilterBuilder('annotations', 'update'),
    delete: makeFilterBuilder('annotations', 'delete'),
    setGroup: makeSetGroupBuilder(),
    /** Action wildcard — matches create, update, delete, AND set-group with the given filter. */
    all: makeFilterBuilder('annotations', '*'),
  },
} as const;

interface FilterBuilder {
  all(): string;
  self(): string;
  createdBy(userId: string): string;
  group(groupId: string): string;
}

function makeFilterBuilder(entity: string, action: string): FilterBuilder {
  return {
    all: () => `${entity}:${action}:all`,
    self: () => `${entity}:${action}:self`,
    createdBy: (userId: string) => `${entity}:${action}:createdBy=${userId}`,
    group: (groupId: string) => `${entity}:${action}:group=${groupId}`,
  };
}

/**
 * `set-group` is an authority filter, not a per-record collab filter:
 * only `:all` and `:group=X` are meaningful (assign-to-any vs
 * assign-to-X). The builder exposes exactly those two — a typo at JWT
 * mint time is caught by the compiler instead of producing a JWT that
 * fails at verify.
 */
interface SetGroupBuilder {
  all(): string;
  group(groupId: string): string;
}

function makeSetGroupBuilder(): SetGroupBuilder {
  return {
    all: () => 'annotations:set-group:all',
    group: (groupId: string) => `annotations:set-group:group=${groupId}`,
  };
}

/**
 * Builder for the `pdf.permissions` virtual scope. Returns the literal
 * string; provided as a helper for parity with caps/collab in JWT
 * construction code.
 */
export const pdfPermissions = (): 'pdf.permissions' => 'pdf.permissions';

/**
 * Materialise `pdf.permissions` into the concrete capability list it
 * would expand to under the given PDF bit configuration.
 *
 * Useful when the customer wants to start from PDF defaults and then
 * subtract specific capabilities — easier to build the JWT scope array
 * by filtering an explicit list than by composing virtual + denials.
 *
 *   const defaults = materializePdfPermissions(pdfBits);
 *   const scope = [
 *     ...defaults.filter(s => s !== 'doc.text.copy'),
 *     'doc.download',
 *   ];
 *
 * IMPORTANT: this MUST stay in sync with `addPdfPermissions` inside
 * resolver.ts. A test pins them together.
 */
export function materializePdfPermissions(b: PdfBits): DocCapability[] {
  const out = new Set<DocCapability>();

  // Always — pdf.permissions means "give me a working session"
  out.add('doc.open');
  out.add('doc.render');
  // Reading existing annotations and form values is unconditional —
  // PDF bit 6 governs writes, not visibility.
  out.add('doc.annotate.read');
  out.add('doc.forms.read');

  if (b.bit5) {
    out.add('doc.text.select');
    out.add('doc.text.copy');
    out.add('doc.text.search');
    out.add('doc.content.copy');
  }
  if (b.bit3) out.add('doc.print');
  if (b.bit12 && b.bit3) out.add('doc.print.high');
  if (b.bit4) {
    out.add('doc.pages.modify');
    out.add('doc.redact');
    out.add('doc.metadata.modify');
    out.add('doc.attachments.modify');
  }
  if (b.bit11) out.add('doc.pages.assemble');
  if (b.bit6) out.add('doc.annotate.modify');
  if (b.bit6 || b.bit9) out.add('doc.forms.fill');
  if (b.bit6 && b.bit4) out.add('doc.forms.modify');

  return [...out];
}
