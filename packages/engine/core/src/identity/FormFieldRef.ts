import type { PageObjectNumber } from './PageObjectNumber';

/**
 * How callers address a logical form field.
 *
 * - `objectNumber` — the indirect object number of the field dictionary.
 *   ISO 32000 guarantees every real AcroForm field dictionary is an
 *   indirect object, and the layer runtime never renumbers (frozen base +
 *   incremental deltas), so this is the durable identity for the lifetime
 *   of a document. Preferred for all engine calls.
 * - `fqn` — the fully qualified field name ("billing.name"). The portable,
 *   semantic identity used by interchange formats (FDF/XFDF) and analytics;
 *   survives document rewrites but is only as unique as the producer made
 *   it. The engine resolves it against the reconciled field tree.
 */
export type FormFieldRef =
  | { kind: 'objectNumber'; fieldObjectNumber: number }
  | { kind: 'fqn'; name: string };

/**
 * URL-safe encoding of a `FormFieldRef`, used by the cloud HTTP surface as
 * the `:fieldKey` route parameter. Decoded by the server back into a
 * `FormFieldRef` via `decodeFieldRefKey`. Mirrors the annotation plane's
 * `encodeStableIdKey` (`obj:42` / `nm:…`) so the two member-key syntaxes
 * read the same on the wire:
 *
 *   `{ kind: 'objectNumber', fieldObjectNumber: 12 }` -> `'obj:12'`
 *   `{ kind: 'fqn', name: 'billing.name' }`           -> `'fqn:billing.name'`
 *
 * The caller is responsible for `encodeURIComponent`-ing the result before
 * splicing it into a URL path; the `wirePaths.layerFormField*` builders
 * already do that. FQNs are opaque strings and may contain anything; the
 * `fqn:` prefix keeps them unambiguous from numeric ids.
 */
export function encodeFieldRefKey(ref: FormFieldRef): string {
  if (ref.kind === 'objectNumber') {
    if (!Number.isInteger(ref.fieldObjectNumber) || ref.fieldObjectNumber <= 0) {
      throw new RangeError(
        `encodeFieldRefKey: fieldObjectNumber must be a positive integer, got ${ref.fieldObjectNumber}`,
      );
    }
    return `obj:${ref.fieldObjectNumber}`;
  }
  return `fqn:${ref.name}`;
}

/**
 * Inverse of `encodeFieldRefKey`. Returns `null` for malformed input so the
 * server can answer 400 InvalidArg with a useful message instead of
 * throwing. The input is the already-`decodeURIComponent`-ed segment from
 * the route path. Empty FQNs are rejected: `fqn:` with no suffix is not a
 * valid identity.
 */
export function decodeFieldRefKey(key: string): FormFieldRef | null {
  if (key.startsWith('obj:')) {
    const rest = key.slice('obj:'.length);
    const n = Number.parseInt(rest, 10);
    if (!Number.isInteger(n) || n <= 0 || String(n) !== rest) return null;
    return { kind: 'objectNumber', fieldObjectNumber: n };
  }
  if (key.startsWith('fqn:')) {
    const name = key.slice('fqn:'.length);
    if (name.length === 0) return null;
    return { kind: 'fqn', name };
  }
  return null;
}

/** A widget annotation of a field, as the forms subsystem sees it. */
export interface FormWidgetRef {
  /**
   * Indirect object number of the widget annotation — the join key to the
   * annotation subsystem's `objectNumber` refs. `0` when the widget is
   * stored as a direct object (spec-violating; cannot be addressed).
   */
  annotObjectNumber: number;
  /**
   * Object number of the page whose /Annots array references the widget.
   * `0` when the widget is not reachable from any page ("unplaced").
   */
  pageObjectNumber: PageObjectNumber;
}
