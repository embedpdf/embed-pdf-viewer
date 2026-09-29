import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type CustomMetadata,
  type CustomMetadataPatch,
  type CustomMetadataService,
  type CustomMetadataUpdateResult,
  type DocumentMetadata,
  type MetadataPatch,
  type MetadataService,
  type MetadataUpdateResult,
  type MutationMeta,
} from '@embedpdf/engine-core/runtime';
import {
  CustomMetadataSchema,
  CustomMetadataUpdateResultSchema,
  DocumentMetadataSchema,
  MetadataUpdateResultSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

interface MetadataDeps {
  http: HttpClient;
  docId: string;
  layerName: string;
  isClosed: () => boolean;
  manifest: ManifestAccessor;
  publisher: SessionEventPublisher;
}

/** One half of the Info dict: the leaf it reads and the route it writes. */
interface MetadataLeaf<T, R> {
  docPath: (docId: string, metadataVersion: number) => string;
  layerPath: (docId: string, layerName: string, metadataVersion: number) => string;
  updatePath: (docId: string, layerName: string) => string;
  parse: (raw: unknown) => T;
  parseResult: (raw: unknown) => R;
}

const STANDARD: MetadataLeaf<DocumentMetadata, MetadataUpdateResult> = {
  docPath: wirePaths.docMetadata,
  layerPath: wirePaths.layerMetadata,
  updatePath: wirePaths.layerMetadataUpdate,
  parse: (raw) => DocumentMetadataSchema.parse(raw),
  parseResult: (raw) => MetadataUpdateResultSchema.parse(raw),
};

const CUSTOM: MetadataLeaf<CustomMetadata, CustomMetadataUpdateResult> = {
  docPath: wirePaths.docCustomMetadata,
  layerPath: wirePaths.layerCustomMetadata,
  updatePath: wirePaths.layerCustomMetadataUpdate,
  parse: (raw) => CustomMetadataSchema.parse(raw),
  parseResult: (raw) => CustomMetadataUpdateResultSchema.parse(raw),
};

function closedError(docId: string): EngineError {
  return new EngineError(EngineErrorCode.DocNotOpen, `document ${docId} is closed`);
}

/**
 * The read. The JSON lives at a content-addressed `…@metadataVersion=N` leaf
 * (not in the manifest); the manifest only publishes the `metadataVersion`
 * pointer, which both halves of the dict share. So the read pulls it from
 * the cached manifest, fetches the leaf, and on a 404 (stale pointer)
 * transparently refreshes the manifest and retries once. `metadataVersion`
 * bumps only on metadata writes, so the leaf stays cached across page and
 * annotation edits.
 */
function readLeaf<T>(deps: MetadataDeps, leaf: MetadataLeaf<T, unknown>): AbortablePromise<T> {
  if (deps.isClosed()) return AbortablePromise.rejectReason(closedError(deps.docId));
  return AbortablePromise.run<T>(async (signal) => {
    const buildPath = async (s: AbortSignal): Promise<string> => {
      const manifest = await deps.manifest.get(s);
      // Plane-scope rule: the leaf depends on the `metadata` plane — while
      // inherited, one doc-level URL serves every visitor.
      return planesInherited(manifest, ['metadata'])
        ? leaf.docPath(deps.docId, manifest.metadataVersion)
        : leaf.layerPath(deps.docId, deps.layerName, manifest.metadataVersion);
    };
    return deps.http.getJsonWithRefresh(
      buildPath,
      leaf.parse,
      async (s) => {
        await deps.manifest.refresh(s);
      },
      signal,
    );
  });
}

/**
 * The write. It only advances docVersion + metadataVersion (no per-page pin
 * changes, no layoutVersion), so the cached manifest is patched in place —
 * no refetch.
 */
function writeLeaf<R extends { meta: MutationMeta }>(
  deps: MetadataDeps,
  leaf: MetadataLeaf<unknown, R>,
  patch: MetadataPatch | CustomMetadataPatch,
  publish: (result: R) => void,
): AbortablePromise<R> {
  if (deps.isClosed()) return AbortablePromise.rejectReason(closedError(deps.docId));
  return AbortablePromise.run<R>(async (signal) => {
    const result = await deps.http.postJson(
      leaf.updatePath(deps.docId, deps.layerName),
      patch,
      leaf.parseResult,
      signal,
    );
    deps.manifest.apply(result.meta, ['metadata']);
    publish(result);
    return result;
  });
}

class CloudCustomMetadataService implements CustomMetadataService {
  constructor(private readonly deps: MetadataDeps) {}

  get(): AbortablePromise<CustomMetadata> {
    return readLeaf(this.deps, CUSTOM);
  }

  update(patch: CustomMetadataPatch): AbortablePromise<CustomMetadataUpdateResult> {
    return writeLeaf(this.deps, CUSTOM, patch, (result) =>
      this.deps.publisher.publishLocal({ type: 'metadata.customUpdated', ...result }),
    );
  }
}

export class CloudMetadataService implements MetadataService {
  readonly custom: CustomMetadataService;
  private readonly deps: MetadataDeps;

  constructor(
    http: HttpClient,
    docId: string,
    layerName: string,
    isClosed: () => boolean,
    manifest: ManifestAccessor,
    publisher: SessionEventPublisher,
  ) {
    this.deps = { http, docId, layerName, isClosed, manifest, publisher };
    this.custom = new CloudCustomMetadataService(this.deps);
  }

  get(): AbortablePromise<DocumentMetadata> {
    return readLeaf(this.deps, STANDARD);
  }

  update(patch: MetadataPatch): AbortablePromise<MetadataUpdateResult> {
    return writeLeaf(this.deps, STANDARD, patch, (result) =>
      this.deps.publisher.publishLocal({ type: 'metadata.updated', ...result }),
    );
  }
}
