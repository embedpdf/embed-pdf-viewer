import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * Input for `pages.setName()`: register `name` → the page in
 * `/Names /Pages`. An existing registration with the same decoded key is
 * replaced (idempotent). With `replace`, that other key is removed in the
 * SAME job — a rename or retarget as one mutation.
 *
 * `name` must be non-empty; the engine never interprets it. Only pages in
 * the page tree may be registered (hidden templates are refused).
 */
export interface PageNameInput {
  name: string;
  pageObjectNumber: PageObjectNumber;
  /** An existing key to drop in the same job (rename). */
  replace?: string;
}

/** Input for `pages.removeName()`: the registration to drop; the page stays. */
export interface PageRemoveNameInput {
  name: string;
}
