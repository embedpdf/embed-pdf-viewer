import {
  assertBundleManifest,
  assertResourceIds,
  type AnnotationBundle,
  type ResourceId,
} from './AnnotationBundle';
import { DEFAULT_ANNOTATION_BUNDLE_LIMITS, type AnnotationBundleLimits } from './bundleLimits';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import { decodedLengthOf, fromBase64, toBase64 } from '../resource/base64';

export interface AnnotationTransferOptions {
  /** The limits the file is written and read under; the defaults otherwise. */
  readonly limits?: AnnotationBundleLimits;
}

/** A resource's entry in the file besides its base64: its id, quotes and separators. */
const RESOURCE_ENTRY_CHARACTERS = 81;
/** The file's own keys and punctuation. */
const ENVELOPE_CHARACTERS = 256;

/**
 * An annotation bundle as one JSON file, each resource in base64: a bundle
 * whole, to store or download. HTTP carries bundles as multipart instead,
 * without the third base64 adds.
 */
export const AnnotationTransfer = {
  /**
   * The file for `bundle`. Its shape, references and limits are checked
   * first, so no file is written that `parse` refuses for them; the
   * resources are checked against their ids by `parse`.
   */
  stringify(bundle: AnnotationBundle, options?: AnnotationTransferOptions): string {
    const limits = options?.limits ?? DEFAULT_ANNOTATION_BUNDLE_LIMITS;
    const resources: Record<string, string> = {};
    const sizes = new Map<string, number>();
    for (const [id, bytes] of Object.entries(bundle.resources)) {
      sizes.set(id, bytes.length);
    }
    assertBundleManifest(bundle, sizes, limits);
    for (const [id, bytes] of Object.entries(bundle.resources)) {
      resources[id] = toBase64(bytes);
    }
    return JSON.stringify({
      format: bundle.format,
      version: bundle.version,
      pages: bundle.pages,
      items: bundle.items,
      resources,
    });
  },

  /**
   * The bundle a file holds, checked whole: `InvalidArg` for anything that
   * isn't a version-1 bundle, a resource that doesn't match its id, an item
   * naming a resource that isn't there, or a resource no item names;
   * `PayloadTooLarge` past a limit. Limits come first, so a file that is
   * refused is never decoded: the text's length, then the counts and every
   * resource's size from its base64, and only then the resources, decoded
   * and hashed.
   */
  async parse(text: string, options?: AnnotationTransferOptions): Promise<AnnotationBundle> {
    const limits = options?.limits ?? DEFAULT_ANNOTATION_BUNDLE_LIMITS;
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
      throw new EngineError(EngineErrorCode.InvalidArg, 'the file is not an annotation bundle', {
        cause: error,
      });
    }
    const encoded =
      typeof file === 'object' && file !== null
        ? (file as { resources?: unknown }).resources
        : null;
    if (typeof encoded !== 'object' || encoded === null || Array.isArray(encoded)) {
      throw new EngineError(EngineErrorCode.InvalidArg, 'the file is not an annotation bundle');
    }

    const sizes = new Map<string, number>();
    for (const [id, value] of Object.entries(encoded)) {
      const size = typeof value === 'string' ? decodedLengthOf(value) : null;
      if (size === null) {
        throw new EngineError(EngineErrorCode.InvalidArg, `resource ${id} is not base64`);
      }
      sizes.set(id, size);
    }
    assertBundleManifest(file, sizes, limits);

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
    await assertResourceIds(resources);
    return {
      format: file.format,
      version: file.version,
      pages: file.pages,
      items: file.items,
      resources,
    };
  },
};
