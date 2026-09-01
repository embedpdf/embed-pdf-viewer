import type { FormSubmissionEntry } from '@embedpdf/engine-core/runtime';

/**
 * Encode a resolved submission dataset as `application/x-www-form-urlencoded`
 * (UTF-8 — the one encoding this helper speaks; a `/CharSet` other than
 * utf-8 is the handler's problem). A name-only entry (`value === null`, the
 * IncludeNoValueFields shape) encodes as a bare name; a multi-select list
 * box repeats the name per value, the HTML-form convention.
 *
 * Pure and dependency-free on purpose: a convenience for embedder handlers,
 * never called by the plugin itself (the plugin never touches a network).
 */
export const submitEntriesToUrlEncoded = (entries: FormSubmissionEntry[]): string =>
  entries
    .flatMap(({ name, value }) =>
      value === null
        ? [encodeURIComponent(name)]
        : Array.isArray(value)
          ? value.map((item) => `${encodeURIComponent(name)}=${encodeURIComponent(item)}`)
          : [`${encodeURIComponent(name)}=${encodeURIComponent(value)}`],
    )
    .join('&');
