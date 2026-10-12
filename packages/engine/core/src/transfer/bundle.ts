/**
 * What every bundle shares, whichever family it carries: resources named by
 * the SHA-256 of their bytes, the table of pages its rows are on, the checks
 * of that shape, and where an import puts each page.
 */
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PdfSize } from '../geometry/primitives';
import { encodePageKey, type PageRef } from '../identity/PageRef';

/** What a bundle holds: annotations, or form fields with their widgets. Messages name it. */
export type BundleKind = 'annotation' | 'form';

/** A resource's name in a bundle: `sha256-` and the SHA-256 of its bytes, lowercase hex. */
export type ResourceId = `sha256-${string}`;

/** A page a bundle's rows are on or point at. */
export interface BundlePage {
  readonly page: PageRef;
  /** Where the page is in its document, for mapping pages by position; never a reference. */
  readonly position: number;
  /**
   * The page's size, as its layout reports it. Positions are measured from
   * the page's top-left, so an import puts each row at the same spot from
   * the top-left of the page it goes to.
   */
  readonly size: PdfSize;
}

/**
 * Where an import puts each page of the bundle:
 *
 * - `'same'` (the default): each page ref as it is;
 * - `'by-position'`: a bundle page to the page at its `position`;
 * - a list: exactly the pairs given.
 */
export type BundleImportPages =
  | 'same'
  | 'by-position'
  | ReadonlyArray<{ readonly from: PageRef; readonly to: PageRef }>;

/** A page of the document an import goes into: its ref and where it is. */
export interface BundleImportTarget {
  readonly page: PageRef;
  readonly position: number;
}

const RESOURCE_ID_PATTERN = /^sha256-[0-9a-f]{64}$/;
const PAGE_FIELDS = ['page', 'position', 'size'] as const;

/** The id of a resource: the SHA-256 of its bytes. */
export async function resourceIdOf(bytes: Uint8Array): Promise<ResourceId> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
  );
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return `sha256-${hex}`;
}

/** Every resource's bytes hash to its id. */
export async function assertResourceIds(
  kind: BundleKind,
  resources: Readonly<Record<string, Uint8Array>>,
): Promise<void> {
  for (const [id, bytes] of Object.entries(resources)) {
    if ((await resourceIdOf(bytes)) !== id) {
      invalidBundle(kind, `resource ${id} doesn't match its id`);
    }
  }
}

/**
 * Check a bundle's page table: each entry a page ref, a position and a
 * size, no page or position listed twice. Returns the listed pages' keys,
 * for the rows to be checked against.
 */
export function assertBundlePages(kind: BundleKind, pages: readonly unknown[]): Set<string> {
  const pageKeys = new Set<string>();
  const positions = new Set<number>();
  for (const entry of pages) {
    if (!isRecord(entry) || !isBundlePageRef(entry.page) || !isSize(entry.size)) {
      invalidBundle(kind, 'a page needs a page ref, a position and a size');
    }
    assertKnownFields(kind, 'a page', entry, PAGE_FIELDS);
    const { position } = entry;
    if (!Number.isInteger(position) || (position as number) < 0) {
      invalidBundle(kind, `page position ${JSON.stringify(position)} is not a position`);
    }
    const key = encodePageKey(entry.page);
    if (pageKeys.has(key)) invalidBundle(kind, `page ${key} is listed twice`);
    if (positions.has(position as number)) {
      invalidBundle(kind, `position ${position} is listed twice`);
    }
    pageKeys.add(key);
    positions.add(position as number);
  }
  return pageKeys;
}

/**
 * Check the resources a row names, by role: each role one of `roles`, each
 * id a resource id the bundle holds. Each id is added to `named`.
 */
export function assertRowResources(
  kind: BundleKind,
  row: string,
  resources: unknown,
  roles: readonly string[],
  resourceSizes: ReadonlyMap<string, number>,
  named: Set<string>,
): void {
  if (!isRecord(resources)) invalidBundle(kind, `${row} has no resources`);
  for (const [role, id] of Object.entries(resources)) {
    if (!roles.includes(role))
      invalidBundle(kind, `${row} names an unknown resource role '${role}'`);
    if (typeof id !== 'string' || !RESOURCE_ID_PATTERN.test(id)) {
      invalidBundle(kind, `${row} names ${JSON.stringify(id)}, which is not a resource id`);
    }
    if (!resourceSizes.has(id))
      invalidBundle(kind, `${row} names ${id}, which the bundle doesn't hold`);
    named.add(id);
  }
}

/**
 * Every resource the bundle holds has a resource id and is named by one of
 * its `rows` (`'item'`, `'widget'`).
 */
export function assertResourcesNamed(
  kind: BundleKind,
  rows: string,
  resourceSizes: ReadonlyMap<string, number>,
  named: ReadonlySet<string>,
): void {
  for (const id of resourceSizes.keys()) {
    if (!RESOURCE_ID_PATTERN.test(id))
      invalidBundle(kind, `${JSON.stringify(id)} is not a resource id`);
    if (!named.has(id)) invalidBundle(kind, `resource ${id} is named by no ${rows}`);
  }
}

/** `value` has no field outside `fields`. */
export function assertKnownFields(
  kind: BundleKind,
  what: string,
  value: Record<string, unknown>,
  fields: readonly string[],
): void {
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) invalidBundle(kind, `${what} has an unknown field '${field}'`);
  }
}

/** Refuse a bundle that isn't one: `InvalidArg`, naming its kind. */
export function invalidBundle(kind: BundleKind, message: string): never {
  throw new EngineError(EngineErrorCode.InvalidArg, `${kind} bundle: ${message}`);
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A page ref as a bundle holds one: by object number. */
export function isBundlePageRef(value: unknown): value is PageRef {
  return (
    isRecord(value) &&
    value.kind === 'objectNumber' &&
    Number.isInteger(value.objectNumber) &&
    (value.objectNumber as number) > 0
  );
}

function isSize(value: unknown): value is PdfSize {
  return (
    isRecord(value) &&
    [value.width, value.height].every(
      (length) => typeof length === 'number' && Number.isFinite(length) && length >= 0,
    )
  );
}

/**
 * Where an import puts each page of a bundle, as `pages` says, among the
 * `target` document's pages. Every page in `named` (the pages the rows are
 * on or point at) must map somewhere: `InvalidArg` names those that don't,
 * and a list that maps to a page the target doesn't have is `NotFound`.
 * Nothing here touches a document, so an import refuses before its first
 * write.
 */
export function bundlePageMapping(input: {
  readonly bundlePages: readonly BundlePage[];
  readonly pages: BundleImportPages;
  readonly target: readonly BundleImportTarget[];
  readonly named: Iterable<PageRef>;
}): (page: PageRef) => PageRef {
  const table = pageTable(input.bundlePages, input.pages, input.target);
  const unmapped = new Set<string>();
  for (const page of input.named) {
    if (!table.has(encodePageKey(page))) unmapped.add(encodePageKey(page));
  }
  if (unmapped.size > 0) {
    const pages = [...unmapped];
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `import: ${pages.length === 1 ? 'page' : 'pages'} ${pages.join(', ')} map to no page of this document`,
      { details: { pages } },
    );
  }
  return (page) => table.get(encodePageKey(page))!;
}

/** Bundle page key → target page. */
function pageTable(
  bundlePages: readonly BundlePage[],
  pages: BundleImportPages,
  target: readonly BundleImportTarget[],
): Map<string, PageRef> {
  const targetByKey = new Map(target.map((entry) => [encodePageKey(entry.page), entry.page]));
  const table = new Map<string, PageRef>();
  if (pages === 'same') {
    for (const entry of bundlePages) {
      const to = targetByKey.get(encodePageKey(entry.page));
      if (to) table.set(encodePageKey(entry.page), to);
    }
  } else if (pages === 'by-position') {
    const byPosition = new Map(target.map((entry) => [entry.position, entry.page]));
    for (const entry of bundlePages) {
      const to = byPosition.get(entry.position);
      if (to) table.set(encodePageKey(entry.page), to);
    }
  } else {
    for (const { from, to } of pages) {
      const key = encodePageKey(from);
      if (table.has(key)) {
        throw new EngineError(EngineErrorCode.InvalidArg, `import: page ${key} is mapped twice`);
      }
      const found = targetByKey.get(encodePageKey(to));
      if (!found) {
        throw new EngineError(
          EngineErrorCode.NotFound,
          `import: the document has no page ${encodePageKey(to)}`,
        );
      }
      table.set(key, found);
    }
  }
  return table;
}
