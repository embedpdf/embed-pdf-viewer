import { bundleCodec } from './codec';
import { assertFormBundleManifest, FORM_BUNDLE_KEYS, type FormBundle } from './FormBundle';

/**
 * A form bundle as one JSON file, each resource in base64: a bundle whole,
 * to store or download. HTTP carries bundles as multipart instead, without
 * the third base64 adds.
 */
export const FormTransfer = bundleCodec<FormBundle>({
  kind: 'form',
  keys: FORM_BUNDLE_KEYS,
  assertManifest: assertFormBundleManifest,
});
