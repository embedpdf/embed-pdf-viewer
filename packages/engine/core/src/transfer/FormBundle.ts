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
import type { WidgetAnnotation } from '../annotation/kinds/widget';
import type { FormFieldDTO } from '../forms/field';
import type { FormFieldRef } from '../identity/FormFieldRef';
import { encodePageKey } from '../identity/PageRef';
import type { Coordinates, PageCoordinates } from '../pageSpace/coordinates';

/**
 * Form fields and their widgets, taken out of a document to go into this one
 * or another: the design (`doc.forms.import`) or only the values
 * (`doc.forms.importValues`). Each row is what a read returns: a field
 * whole, with its value and who made and filled it, and each of its
 * widgets as the form's rows read them. Any set of whole fields, their
 * widgets and the resources these name is a bundle.
 */
export interface FormBundle<C extends Coordinates = PageCoordinates> {
  readonly format: 'embedpdf/form';
  readonly version: 1;
  /** Every page a widget is on or points at, in document order. */
  readonly pages: readonly BundlePage[];
  /** Whole fields, in the form's order. */
  readonly fields: readonly FormBundleField<C>[];
  /** The fields' widgets, in their fields' order. */
  readonly widgets: readonly FormBundleWidget<C>[];
  /** The calculation order among these fields. */
  readonly calculationOrder: readonly FormFieldRef[];
  readonly resources: Readonly<Record<ResourceId, Uint8Array>>;
}

export interface FormBundleField<C extends Coordinates = PageCoordinates> {
  /**
   * The field as a read returns it. A field the form doesn't export
   * (`noExport`) comes without its value or who filled it, and a signed
   * signature field without its signature: a signature never travels.
   */
  readonly data: FormFieldDTO<C>;
}

export interface FormBundleWidget<C extends Coordinates = PageCoordinates> {
  readonly data: WidgetAnnotation<C>;
  /** None yet: a widget is drawn from its data. A push button's icon will be one. */
  readonly resources: Readonly<Record<string, ResourceId>>;
}

/** A bundle as a worker returns it: each resource an `ArrayBuffer` on the transfer list. */
export interface WireFormBundle<C extends Coordinates = PageCoordinates> extends Omit<
  FormBundle<C>,
  'resources'
> {
  readonly resources: Readonly<Record<ResourceId, ArrayBuffer>>;
}

export const FORM_BUNDLE_FORMAT = 'embedpdf/form';
export const FORM_BUNDLE_VERSION = 1;

/** The manifest's keys, in the order a file writes them. */
export const FORM_BUNDLE_KEYS = [
  'format',
  'version',
  'pages',
  'fields',
  'widgets',
  'calculationOrder',
] as const;

/** The resource roles a widget names: none yet. */
const WIDGET_RESOURCE_ROLES: readonly string[] = [];

const BUNDLE_FIELDS = [...FORM_BUNDLE_KEYS, 'resources'] as const;
const FIELD_ROW_FIELDS = ['data'] as const;
const WIDGET_ROW_FIELDS = ['data', 'resources'] as const;

/**
 * Check a bundle before anything uses it, the checks cheapest first: its
 * format, its counts and sizes against `limits` (`PayloadTooLarge`), its
 * shape and references (`InvalidArg`), then every resource against its id.
 */
export async function assertFormBundle(
  bundle: FormBundle,
  limits: BundleLimits = DEFAULT_BUNDLE_LIMITS,
): Promise<void> {
  const resources = isRecord(bundle?.resources)
    ? bundle.resources
    : invalidBundle('form', 'no resources');
  const sizes = new Map<string, number>();
  for (const [id, bytes] of Object.entries(resources)) {
    if (!(bytes instanceof Uint8Array)) invalidBundle('form', `resource ${id} is not bytes`);
    sizes.set(id, bytes.length);
  }
  assertFormBundleManifest(bundle, sizes, limits);
  await assertResourceIds('form', resources);
}

/**
 * The checks that need no resource bytes, only their sizes by id: format
 * and version, counts, sizes, the shape of pages, fields and widgets, and
 * that widgets and resources name each other exactly. That a widget's field
 * is among the bundle's is the import's to decide: one that isn't is left
 * out.
 */
export function assertFormBundleManifest(
  manifest: unknown,
  resourceSizes: ReadonlyMap<string, number>,
  limits: BundleLimits,
): asserts manifest is Omit<FormBundle, 'resources'> {
  if (!isRecord(manifest)) invalidBundle('form', 'not a form bundle');
  assertKnownFields('form', 'the bundle', manifest, BUNDLE_FIELDS);
  if (manifest.format !== FORM_BUNDLE_FORMAT) {
    invalidBundle('form', `unknown format ${JSON.stringify(manifest.format)}`);
  }
  if (manifest.version !== FORM_BUNDLE_VERSION) {
    invalidBundle('form', `unknown version ${JSON.stringify(manifest.version)}`);
  }
  const { pages, fields, widgets, calculationOrder } = manifest;
  if (!Array.isArray(pages)) invalidBundle('form', 'pages is not a list');
  if (!Array.isArray(fields)) invalidBundle('form', 'fields is not a list');
  if (!Array.isArray(widgets)) invalidBundle('form', 'widgets is not a list');
  if (!Array.isArray(calculationOrder)) invalidBundle('form', 'calculationOrder is not a list');

  assertWithinLimit('form', limits, 'items', fields.length + widgets.length);
  assertWithinLimit('form', limits, 'pages', pages.length);
  assertWithinLimit('form', limits, 'resources', resourceSizes.size);
  let bundleBytes = manifestBytesOf({ pages, fields, widgets, calculationOrder });
  assertWithinLimit('form', limits, 'manifestBytes', bundleBytes);
  for (const size of resourceSizes.values()) {
    assertWithinLimit('form', limits, 'resourceBytes', size);
    bundleBytes += size;
  }
  assertWithinLimit('form', limits, 'bundleBytes', bundleBytes);

  const pageKeys = assertBundlePages('form', pages);
  fields.forEach((row, index) => {
    if (
      !isRecord(row) ||
      !isRecord(row.data) ||
      typeof row.data.family !== 'string' ||
      typeof row.data.name !== 'string' ||
      !isRecord(row.data.ref)
    ) {
      invalidBundle('form', `field ${index} has no field data`);
    }
    assertKnownFields('form', `field ${index}`, row, FIELD_ROW_FIELDS);
  });
  const named = new Set<string>();
  widgets.forEach((row, index) => {
    if (!isRecord(row) || !isRecord(row.data) || row.data.subtype !== 'widget') {
      invalidBundle('form', `widget ${index} has no widget data`);
    }
    assertKnownFields('form', `widget ${index}`, row, WIDGET_ROW_FIELDS);
    const ref = row.data.ref;
    const page = isRecord(ref) ? ref.page : undefined;
    if (!isBundlePageRef(page) || !pageKeys.has(encodePageKey(page))) {
      invalidBundle('form', `widget ${index} is on a page the bundle doesn't list`);
    }
    assertRowResources(
      'form',
      `widget ${index}`,
      row.resources,
      WIDGET_RESOURCE_ROLES,
      resourceSizes,
      named,
    );
  });
  calculationOrder.forEach((ref, index) => {
    if (!isRecord(ref))
      invalidBundle('form', `calculation order entry ${index} is not a field ref`);
  });
  assertResourcesNamed('form', 'widget', resourceSizes, named);
}
