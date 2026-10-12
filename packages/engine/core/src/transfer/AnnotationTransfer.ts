import {
  ANNOTATION_BUNDLE_KEYS,
  assertAnnotationBundleManifest,
  type AnnotationBundle,
} from './AnnotationBundle';
import { bundleCodec } from './codec';

/**
 * An annotation bundle as one JSON file, each resource in base64: a bundle
 * whole, to store or download. HTTP carries bundles as multipart instead,
 * without the third base64 adds.
 */
export const AnnotationTransfer = bundleCodec<AnnotationBundle>({
  kind: 'annotation',
  keys: ANNOTATION_BUNDLE_KEYS,
  assertManifest: assertAnnotationBundleManifest,
});
