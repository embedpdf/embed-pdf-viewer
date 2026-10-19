import { assertResourceIds, type BundleKind, type ResourceId } from './bundle';
import { DEFAULT_BUNDLE_LIMITS, type BundleLimits } from './bundleLimits';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { decodedLengthOf, fromBase64, toBase64 } from '../resource/base64';

export interface BundleTransferOptions {
  /** The limits the file is written and read under; the defaults otherwise. */
  readonly limits?: BundleLimits;
}

/** A bundle as one JSON file, each resource in base64. */
export interface BundleCodec<Bundle> {
  /**
   * The file for `bundle`. Its shape, references and limits are checked
   * first, so no file is written that `parse` refuses for them; the
   * resources are checked against their ids by `parse`.
   */
  stringify(bundle: Bundle, options?: BundleTransferOptions): string;
  /**
   * The bundle a file holds, checked whole: `InvalidArg` for anything that
   * isn't a bundle of this family and version, a resource that doesn't match
   * its id, a row naming a resource that isn't there, or a resource no row
   * names; `PayloadTooLarge` past a limit. Limits come first, so a file that
   * is refused is never decoded: the text's length, then the counts and
   * every resource's size from its base64, and only then the resources,
   * decoded and hashed.
   */
  parse(text: string, options?: BundleTransferOptions): Promise<Bundle>;
}

/** What a family's file is: its kind, its manifest's keys, and their check. */
export interface BundleFileSpec<Bundle> {
  readonly kind: BundleKind;
  /** The bundle's keys besides `resources`, in the order the file writes them. */
  readonly keys: readonly Exclude<keyof Bundle & string, 'resources'>[];
  /**
   * Check everything but the resources' bytes, given their sizes by id:
   * format and version, counts and sizes against `limits`, shape and
   * references.
   */
  assertManifest(
    manifest: unknown,
    resourceSizes: ReadonlyMap<string, number>,
    limits: BundleLimits,
  ): void;
}

/** A resource's entry in the file besides its base64: its id, quotes and separators. */
const RESOURCE_ENTRY_CHARACTERS = 81;
/** The file's own keys and punctuation. */
const ENVELOPE_CHARACTERS = 256;

const A_BUNDLE: Record<BundleKind, string> = {
  annotation: 'an annotation bundle',
  form: 'a form bundle',
};

/**
 * The JSON file of one family's bundles: a bundle whole, to store or
 * download. HTTP carries bundles as multipart instead, without the third
 * base64 adds.
 */
export function bundleCodec<
  Bundle extends { readonly resources: Readonly<Record<ResourceId, Uint8Array>> },
>(spec: BundleFileSpec<Bundle>): BundleCodec<Bundle> {
  const notABundle = (cause?: unknown) =>
    new EngineError(
      EngineErrorCode.InvalidArg,
      `the file is not ${A_BUNDLE[spec.kind]}`,
      cause === undefined ? undefined : { cause },
    );

  return {
    stringify(bundle, options) {
      const limits = options?.limits ?? DEFAULT_BUNDLE_LIMITS;
      const sizes = new Map<string, number>();
      for (const [id, bytes] of Object.entries(bundle.resources)) sizes.set(id, bytes.length);
      spec.assertManifest(bundle, sizes, limits);
      const file: Record<string, unknown> = {};
      for (const key of spec.keys) file[key] = bundle[key];
      const resources: Record<string, string> = {};
      for (const [id, bytes] of Object.entries(bundle.resources)) resources[id] = toBase64(bytes);
      file.resources = resources;
      return JSON.stringify(file);
    },

    async parse(text, options) {
      const limits = options?.limits ?? DEFAULT_BUNDLE_LIMITS;
      const maxLength =
        Math.ceil((limits.bundleBytes * 4) / 3) +
        limits.resources * RESOURCE_ENTRY_CHARACTERS +
        ENVELOPE_CHARACTERS;
      if (text.length > maxLength) {
        throw new EngineError(
          EngineErrorCode.PayloadTooLarge,
          `the file is ${text.length} characters, more than a bundle within ` +
            `${limits.bundleBytes} bytes can be`,
          { details: { limit: 'bundleBytes', max: limits.bundleBytes, fileLength: text.length } },
        );
      }

      let file: unknown;
      try {
        file = JSON.parse(text);
      } catch (error) {
        throw notABundle(error);
      }
      const encoded =
        typeof file === 'object' && file !== null
          ? (file as { resources?: unknown }).resources
          : null;
      if (typeof encoded !== 'object' || encoded === null || Array.isArray(encoded)) {
        throw notABundle();
      }

      const sizes = new Map<string, number>();
      for (const [id, value] of Object.entries(encoded)) {
        const size = typeof value === 'string' ? decodedLengthOf(value) : null;
        if (size === null) {
          throw new EngineError(EngineErrorCode.InvalidArg, `resource ${id} is not base64`);
        }
        sizes.set(id, size);
      }
      spec.assertManifest(file, sizes, limits);

      const resources: Record<ResourceId, Uint8Array> = {};
      for (const [id, value] of Object.entries(encoded as Record<ResourceId, string>)) {
        try {
          resources[id as ResourceId] = fromBase64(value);
        } catch (error) {
          throw new EngineError(EngineErrorCode.InvalidArg, `resource ${id} is not base64`, {
            cause: error,
          });
        }
      }
      await assertResourceIds(spec.kind, resources);
      const bundle: Record<string, unknown> = {};
      for (const key of spec.keys) bundle[key] = (file as Record<string, unknown>)[key];
      bundle.resources = resources;
      return bundle as unknown as Bundle;
    },
  };
}
