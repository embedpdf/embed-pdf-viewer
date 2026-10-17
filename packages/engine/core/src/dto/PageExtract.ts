import { PermissionDenied } from '../auth/scope/errors';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { PageRef } from '../identity/PageRef';
import type { FlattenOptions, PageFlattenUsage } from '../mutation/PageFlattenResult';
import { resolvePageLayers, type PageLayerRights, type PageRenderLayers } from './PageRender';

/** Options of `pages.extract()`. */
export interface PageExtractOptions {
  /**
   * Copy the pages as they draw, with `pages.flatten()`'s options: the
   * annotations and form fields that draw for `usage` painted into the pages,
   * an annotation without a stored appearance included, and nothing
   * interactive left (no annotations, no page actions). Layers keep the
   * state they have for `usage`. `{ usage: 'print' }` makes a print copy.
   * Needs `doc.download` or `doc.download.flattened`.
   */
  flatten?: FlattenOptions;
  /**
   * With `flatten`: paint the annotations. Default: `true` when the caller
   * may read annotations (`doc.annotate.read`). `true` for a caller who may
   * not is refused.
   */
  includeAnnotations?: boolean;
  /**
   * With `flatten`: paint the form fields, as filled. Default: `false` when
   * `includeAnnotations` is `false`, otherwise `true` when the caller may
   * read the form (`doc.forms.read`). `true` for a caller who may not is
   * refused.
   */
  includeFormFields?: boolean;
}

/** The body of `POST …/pages/extract`: the pages, and the options. */
export interface PageExtractInput extends PageExtractOptions {
  pages: PageRef[];
}

/** What a flattened copy paints, resolved against what the caller may read. */
export interface PageExtractFlatten extends PageRenderLayers {
  readonly usage: PageFlattenUsage;
}

/** What a caller may do, for {@link resolvePageExtract}. */
export interface PageExtractRights extends PageLayerRights {
  /** `doc.download`. */
  readonly download: boolean;
  /** `doc.download.flattened`. */
  readonly downloadFlattened: boolean;
}

/**
 * What `pages.extract()` makes: `null` for a plain copy, else what the
 * flattened copy paints. A plain copy needs `doc.download`; a flattened one
 * `doc.download` or `doc.download.flattened`, and paints only what the caller
 * may read, with the defaults of a page picture (`resolvePageLayers`). The
 * include options belong to `flatten`: given without it, they're refused.
 */
export function resolvePageExtract(
  options: PageExtractOptions | undefined,
  may: PageExtractRights,
): PageExtractFlatten | null {
  const flatten = options?.flatten;
  if (flatten === undefined) {
    for (const field of ['includeAnnotations', 'includeFormFields'] as const) {
      if (options?.[field] !== undefined) {
        throw new EngineError(EngineErrorCode.InvalidArg, `${field} takes flatten`, {
          details: { field },
        });
      }
    }
    if (!may.download) throw new PermissionDenied('doc.download');
    return null;
  }

  const usage = flatten.usage ?? 'display';
  if (usage !== 'display' && usage !== 'print') {
    throw new EngineError(EngineErrorCode.InvalidArg, 'usage must be "display" or "print"', {
      details: { field: 'flatten.usage' },
    });
  }
  if (!may.download && !may.downloadFlattened) {
    throw new PermissionDenied('doc.download', 'flatten', [
      'doc.download',
      'doc.download.flattened',
    ]);
  }
  return { usage, ...resolvePageLayers(options, may) };
}
