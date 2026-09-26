import {
  assertWithinLimit,
  DEFAULT_ANNOTATION_BUNDLE_LIMITS,
  manifestBytesOf,
  type AnnotationBundleLimits,
} from './bundleLimits';
import type { AnnotationDTO } from '../annotation/kinds';
import {
  ANNOTATION_RESOURCE_ROLE_NAMES,
  type AnnotationResourceRole,
} from '../annotation/resources';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PdfRect } from '../geometry/primitives';
import { encodePageKey, type PageRef } from '../identity/PageRef';

/** A resource's name in a bundle: `sha256-` and the SHA-256 of its bytes, lowercase hex. */
export type ResourceId = `sha256-${string}`;

/**
 * Annotations and the bytes beside them, taken out of a document to go into
 * this one or another. Each item is a row: its data, exactly what a read
 * returns, and the resources it names by id. Each resource is here once,
 * however many items name it, under the SHA-256 of its bytes, so a receiver
 * can check it and a host can store it once. Any set of rows and the
 * resources they name is a bundle.
 */
export interface AnnotationBundle {
  readonly format: 'embedpdf/annotations';
  readonly version: 1;
  /** Every page an item is on or points at, in document order. */
  readonly pages: readonly AnnotationBundlePage[];
  /** In page order, then in each page's annotation order. */
  readonly items: readonly AnnotationBundleItem[];
  readonly resources: Readonly<Record<ResourceId, Uint8Array>>;
}

export interface AnnotationBundlePage {
  readonly page: PageRef;
  /** Where the page is in its document, for mapping pages by position; never a reference. */
  readonly position: number;
  /** The page's box, as the source document reports it. */
  readonly box: PdfRect;
}

export interface AnnotationBundleItem {
  readonly data: AnnotationDTO;
  readonly resources: Readonly<Partial<Record<AnnotationResourceRole, ResourceId>>>;
}

/** A bundle as a worker returns it: each resource an `ArrayBuffer` on the transfer list. */
export interface WireAnnotationBundle extends Omit<AnnotationBundle, 'resources'> {
  readonly resources: Readonly<Record<ResourceId, ArrayBuffer>>;
}

export const ANNOTATION_BUNDLE_FORMAT = 'embedpdf/annotations';
export const ANNOTATION_BUNDLE_VERSION = 1;

const RESOURCE_ID_PATTERN = /^sha256-[0-9a-f]{64}$/;
const BUNDLE_FIELDS = ['format', 'version', 'pages', 'items', 'resources'] as const;
const PAGE_FIELDS = ['page', 'position', 'box'] as const;
const ITEM_FIELDS = ['data', 'resources'] as const;

/** The id of a resource: the SHA-256 of its bytes. */
export async function resourceIdOf(bytes: Uint8Array): Promise<ResourceId> {
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>),
  );
  let hex = '';
  for (const byte of digest) hex += byte.toString(16).padStart(2, '0');
  return `sha256-${hex}`;
}

/**
 * Check a bundle before anything uses it, the checks cheapest first: its
 * format, its counts and sizes against `limits` (`PayloadTooLarge`), its
 * shape and references (`InvalidArg`), then every resource against its id.
 */
export async function assertAnnotationBundle(
  bundle: AnnotationBundle,
  limits: AnnotationBundleLimits = DEFAULT_ANNOTATION_BUNDLE_LIMITS,
): Promise<void> {
  const resources = isRecord(bundle?.resources) ? bundle.resources : invalid('no resources');
  const sizes = new Map<string, number>();
  for (const [id, bytes] of Object.entries(resources)) {
    if (!(bytes instanceof Uint8Array)) invalid(`resource ${id} is not bytes`);
    sizes.set(id, bytes.length);
  }
  assertBundleManifest(bundle, sizes, limits);
  await assertResourceIds(resources);
}

/**
 * The checks that need no resource bytes, only their sizes by id: format
 * and version, counts, sizes, the shape of pages and items, and that items
 * and resources name each other exactly.
 */
export function assertBundleManifest(
  manifest: unknown,
  resourceSizes: ReadonlyMap<string, number>,
  limits: AnnotationBundleLimits,
): asserts manifest is Omit<AnnotationBundle, 'resources'> {
  if (!isRecord(manifest)) invalid('not an annotation bundle');
  assertKnownFields('the bundle', manifest, BUNDLE_FIELDS);
  if (manifest.format !== ANNOTATION_BUNDLE_FORMAT) {
    invalid(`unknown format ${JSON.stringify(manifest.format)}`);
  }
  if (manifest.version !== ANNOTATION_BUNDLE_VERSION) {
    invalid(`unknown version ${JSON.stringify(manifest.version)}`);
  }
  const { pages, items } = manifest;
  if (!Array.isArray(pages)) invalid('pages is not a list');
  if (!Array.isArray(items)) invalid('items is not a list');

  assertWithinLimit(limits, 'items', items.length);
  assertWithinLimit(limits, 'pages', pages.length);
  assertWithinLimit(limits, 'resources', resourceSizes.size);
  let bundleBytes = manifestBytesOf({ pages, items });
  assertWithinLimit(limits, 'manifestBytes', bundleBytes);
  for (const size of resourceSizes.values()) {
    assertWithinLimit(limits, 'resourceBytes', size);
    bundleBytes += size;
  }
  assertWithinLimit(limits, 'bundleBytes', bundleBytes);

  const pageKeys = new Set<string>();
  const positions = new Set<number>();
  for (const entry of pages) {
    if (!isRecord(entry) || !isPageRef(entry.page) || !isRect(entry.box)) {
      invalid('a page needs a page ref, a position and a box');
    }
    assertKnownFields('a page', entry, PAGE_FIELDS);
    const { position } = entry;
    if (!Number.isInteger(position) || (position as number) < 0) {
      invalid(`page position ${JSON.stringify(position)} is not a position`);
    }
    const key = encodePageKey(entry.page);
    if (pageKeys.has(key)) invalid(`page ${key} is listed twice`);
    if (positions.has(position as number)) invalid(`position ${position} is listed twice`);
    pageKeys.add(key);
    positions.add(position as number);
  }

  const named = new Set<string>();
  items.forEach((item, index) => {
    if (!isRecord(item) || !isRecord(item.data) || typeof item.data.subtype !== 'string') {
      invalid(`item ${index} has no annotation data`);
    }
    assertKnownFields(`item ${index}`, item, ITEM_FIELDS);
    const ref = item.data.ref;
    const page = isRecord(ref) ? ref.page : undefined;
    if (!isPageRef(page) || !pageKeys.has(encodePageKey(page))) {
      invalid(`item ${index} is on a page the bundle doesn't list`);
    }
    if (!isRecord(item.resources)) invalid(`item ${index} has no resources`);
    for (const [role, id] of Object.entries(item.resources)) {
      if (!(ANNOTATION_RESOURCE_ROLE_NAMES as readonly string[]).includes(role)) {
        invalid(`item ${index} names an unknown resource role '${role}'`);
      }
      if (typeof id !== 'string' || !RESOURCE_ID_PATTERN.test(id)) {
        invalid(`item ${index} names ${JSON.stringify(id)}, which is not a resource id`);
      }
      if (!resourceSizes.has(id))
        invalid(`item ${index} names ${id}, which the bundle doesn't hold`);
      named.add(id);
    }
  });
  for (const id of resourceSizes.keys()) {
    if (!RESOURCE_ID_PATTERN.test(id)) invalid(`${JSON.stringify(id)} is not a resource id`);
    if (!named.has(id)) invalid(`resource ${id} is named by no item`);
  }
}

/** Every resource's bytes hash to its id. */
export async function assertResourceIds(
  resources: Readonly<Record<string, Uint8Array>>,
): Promise<void> {
  for (const [id, bytes] of Object.entries(resources)) {
    if ((await resourceIdOf(bytes)) !== id) invalid(`resource ${id} doesn't match its id`);
  }
}

function assertKnownFields(
  what: string,
  value: Record<string, unknown>,
  fields: readonly string[],
): void {
  for (const field of Object.keys(value)) {
    if (!fields.includes(field)) invalid(`${what} has an unknown field '${field}'`);
  }
}

function invalid(message: string): never {
  throw new EngineError(EngineErrorCode.InvalidArg, `annotation bundle: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPageRef(value: unknown): value is PageRef {
  return (
    isRecord(value) &&
    value.kind === 'objectNumber' &&
    Number.isInteger(value.pageObjectNumber) &&
    (value.pageObjectNumber as number) > 0
  );
}

function isRect(value: unknown): value is PdfRect {
  return (
    isRecord(value) &&
    [value.left, value.bottom, value.right, value.top].every(
      (edge) => typeof edge === 'number' && Number.isFinite(edge),
    )
  );
}
