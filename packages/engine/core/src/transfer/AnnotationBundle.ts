import {
  assertBundlePages,
  assertKnownFields,
  assertResourceIds,
  assertResourcesNamed,
  assertRowResources,
  invalidBundle,
  isBundlePageRef,
  isRecord,
  type BundlePage,
  type ResourceId,
} from './bundle';
import {
  assertWithinLimit,
  DEFAULT_BUNDLE_LIMITS,
  manifestBytesOf,
  type BundleLimits,
} from './bundleLimits';
import type { Annotation } from '../annotation/kinds';
import {
  ANNOTATION_RESOURCE_ROLE_NAMES,
  type AnnotationResourceRole,
} from '../annotation/resources';
import { encodePageKey } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Annotations and the bytes beside them, taken out of a document to go into
 * this one or another. Each item is a row: its data, exactly what a read
 * returns, and the resources it names by id. Each resource is here once,
 * however many items name it, under the SHA-256 of its bytes, so a receiver
 * can check it and a host can store it once. Any set of rows and the
 * resources they name is a bundle.
 */
export interface AnnotationBundle<C extends Coordinates = PageCoordinates> {
  readonly format: 'embedpdf/annotations';
  readonly version: 1;
  /** Every page an item is on or points at, in document order. */
  readonly pages: readonly BundlePage[];
  /** In page order, then in each page's annotation order. */
  readonly items: readonly AnnotationBundleItem<C>[];
  readonly resources: Readonly<Record<ResourceId, Uint8Array>>;
}

export interface AnnotationBundleItem<C extends Coordinates = PageCoordinates> {
  readonly data: Annotation<C>;
  readonly resources: Readonly<Partial<Record<AnnotationResourceRole, ResourceId>>>;
}

/** A bundle as a worker returns it: each resource an `ArrayBuffer` on the transfer list. */
export interface WireAnnotationBundle<C extends Coordinates = PageCoordinates> extends Omit<
  AnnotationBundle<C>,
  'resources'
> {
  readonly resources: Readonly<Record<ResourceId, ArrayBuffer>>;
}

export const ANNOTATION_BUNDLE_FORMAT = 'embedpdf/annotations';
export const ANNOTATION_BUNDLE_VERSION = 1;

/** The manifest's keys, in the order a file writes them. */
export const ANNOTATION_BUNDLE_KEYS = ['format', 'version', 'pages', 'items'] as const;

const BUNDLE_FIELDS = [...ANNOTATION_BUNDLE_KEYS, 'resources'] as const;
const ITEM_FIELDS = ['data', 'resources'] as const;

/**
 * Check a bundle before anything uses it, the checks cheapest first: its
 * format, its counts and sizes against `limits` (`PayloadTooLarge`), its
 * shape and references (`InvalidArg`), then every resource against its id.
 */
export async function assertAnnotationBundle(
  bundle: AnnotationBundle,
  limits: BundleLimits = DEFAULT_BUNDLE_LIMITS,
): Promise<void> {
  const resources = isRecord(bundle?.resources)
    ? bundle.resources
    : invalidBundle('annotation', 'no resources');
  const sizes = new Map<string, number>();
  for (const [id, bytes] of Object.entries(resources)) {
    if (!(bytes instanceof Uint8Array)) invalidBundle('annotation', `resource ${id} is not bytes`);
    sizes.set(id, bytes.length);
  }
  assertAnnotationBundleManifest(bundle, sizes, limits);
  await assertResourceIds('annotation', resources);
}

/**
 * The checks that need no resource bytes, only their sizes by id: format
 * and version, counts, sizes, the shape of pages and items, and that items
 * and resources name each other exactly.
 */
export function assertAnnotationBundleManifest(
  manifest: unknown,
  resourceSizes: ReadonlyMap<string, number>,
  limits: BundleLimits,
): asserts manifest is Omit<AnnotationBundle, 'resources'> {
  if (!isRecord(manifest)) invalidBundle('annotation', 'not an annotation bundle');
  assertKnownFields('annotation', 'the bundle', manifest, BUNDLE_FIELDS);
  if (manifest.format !== ANNOTATION_BUNDLE_FORMAT) {
    invalidBundle('annotation', `unknown format ${JSON.stringify(manifest.format)}`);
  }
  if (manifest.version !== ANNOTATION_BUNDLE_VERSION) {
    invalidBundle('annotation', `unknown version ${JSON.stringify(manifest.version)}`);
  }
  const { pages, items } = manifest;
  if (!Array.isArray(pages)) invalidBundle('annotation', 'pages is not a list');
  if (!Array.isArray(items)) invalidBundle('annotation', 'items is not a list');

  assertWithinLimit('annotation', limits, 'items', items.length);
  assertWithinLimit('annotation', limits, 'pages', pages.length);
  assertWithinLimit('annotation', limits, 'resources', resourceSizes.size);
  let bundleBytes = manifestBytesOf({ pages, items });
  assertWithinLimit('annotation', limits, 'manifestBytes', bundleBytes);
  for (const size of resourceSizes.values()) {
    assertWithinLimit('annotation', limits, 'resourceBytes', size);
    bundleBytes += size;
  }
  assertWithinLimit('annotation', limits, 'bundleBytes', bundleBytes);

  const pageKeys = assertBundlePages('annotation', pages);
  const named = new Set<string>();
  items.forEach((item, index) => {
    if (!isRecord(item) || !isRecord(item.data) || typeof item.data.subtype !== 'string') {
      invalidBundle('annotation', `item ${index} has no annotation data`);
    }
    assertKnownFields('annotation', `item ${index}`, item, ITEM_FIELDS);
    const ref = item.data.ref;
    const page = isRecord(ref) ? ref.page : undefined;
    if (!isBundlePageRef(page) || !pageKeys.has(encodePageKey(page))) {
      invalidBundle('annotation', `item ${index} is on a page the bundle doesn't list`);
    }
    assertRowResources(
      'annotation',
      `item ${index}`,
      item.resources,
      ANNOTATION_RESOURCE_ROLE_NAMES,
      resourceSizes,
      named,
    );
  });
  assertResourcesNamed('annotation', 'item', resourceSizes, named);
}
