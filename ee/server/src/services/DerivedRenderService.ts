import { Buffer } from 'node:buffer';
import {
  EngineError,
  EngineErrorCode,
  wirePack,
  type PageImageOptions,
  type PageNetworkRenderFormat,
} from '@embedpdf/engine-core/runtime';
import {
  encodeRenderToken,
  flatten,
  pageRenderOptionsFromImageOptions,
  type RenderPolicy,
} from '@embedpdf/engine-core/wire';

import type { DocumentsRepo } from '../db/repos/documents.repo';
import type { SharpImageEncoder } from '../render/SharpImageEncoder';
import type { WorkerThreadPool } from '../runtime/WorkerThreadPool';
import type { BaseFileCache } from '../storage/BaseFileCache';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

export interface DerivedRenderServiceOptions {
  storage: ObjectStore;
  /** Allowed `viewport.scale` lattice points. Default `[1, 2]`. */
  scales?: number[];
  /**
   * When true, off-lattice VERSIONED render tokens are rejected with 400
   * (`renderPolicy` echoed). When false (default until the SDK ships its
   * `snap` helper), off-lattice renders are computed but never persisted —
   * no breakage, no storage-DoS surface.
   */
  enforce?: boolean;
  /** Warm-path deps; optional so route-only tests can skip them. */
  cache?: BaseFileCache;
  pool?: WorkerThreadPool;
  encoder?: SharpImageEncoder;
  documents?: DocumentsRepo;
}

export interface LatticeClassification {
  onLattice: boolean;
  /**
   * The CANONICAL token re-encoded from the validated values — never the
   * client's raw string, so value spelling差 (`320` vs `320.0`) cannot mint
   * distinct artifacts. Present only when on-lattice AND version-pinned
   * (unpinned renders are never durable — they have no identity).
   */
  canonicalToken?: string;
}

export interface DerivedRenderResult {
  bytes: Uint8Array;
  contentType: string;
  source: 'store' | 'produced';
}

/**
 * The derived-artifact plane for renders (SCALE-OUT.md §2.1b/§2.1c).
 *
 * ONE door: `getOrRender` is a read-through over the object store with
 * per-key singleflight — the route's miss path and the ingest warmer both
 * come through here, so a warm racing a dashboard read collapses to one
 * render. Cross-replica duplicates are accepted (cache, not truth).
 *
 * The lattice makes durability sane: URL space == artifact space at the
 * canonical points, so a page has a bounded artifact set per version.
 */
export class DerivedRenderService {
  private readonly storage: ObjectStore;
  private readonly scales: number[];
  private readonly enforce: boolean;
  private readonly cache?: BaseFileCache;
  private readonly pool?: WorkerThreadPool;
  private readonly encoder?: SharpImageEncoder;
  private readonly documents?: DocumentsRepo;
  private readonly inFlight = new Map<string, Promise<DerivedRenderResult>>();

  constructor(opts: DerivedRenderServiceOptions) {
    this.storage = opts.storage;
    this.scales = opts.scales ?? [1, 2];
    this.enforce = opts.enforce ?? false;
    this.cache = opts.cache;
    this.pool = opts.pool;
    this.encoder = opts.encoder;
    this.documents = opts.documents;
  }

  /** The advertised deployment policy — rides `/v1/access`, never manifests. */
  policy(): RenderPolicy {
    return {
      viewport: { kind: 'scale', scales: [...this.scales] },
      formats: ['webp'],
      background: 'white',
      enforced: this.enforce,
    };
  }

  get enforced(): boolean {
    return this.enforce;
  }

  /**
   * Classify a validated render request against the lattice. Conservative
   * by construction: any option outside the enumerated canonical set —
   * target rects, rotations, quality overrides, png — is off-lattice
   * (computed, never persisted).
   */
  classify(input: {
    imageOptions: PageImageOptions;
    format: PageNetworkRenderFormat;
    contentVersion?: number;
    annotationVersion?: number;
  }): LatticeClassification {
    const o = input.imageOptions;
    const viewport = o.viewport;
    const scale = viewport?.kind === 'scale' ? viewport.scale : undefined;
    const onLattice =
      viewport?.kind === 'scale' &&
      scale !== undefined &&
      this.scales.includes(scale) &&
      input.format === 'webp' &&
      (o.background === undefined || o.background === 'white') &&
      (o.target === undefined || o.target.kind === 'page') &&
      (o.rotation === undefined || o.rotation === 0) &&
      o.quality === undefined;

    if (!onLattice || input.contentVersion === undefined) {
      return { onLattice };
    }

    const includeAnnotations = o.includeAnnotations ?? true;
    const canonicalToken = encodeRenderToken(
      flatten({
        contentVersion: input.contentVersion,
        // The codec FORBIDS annotationVersion when annotations are off —
        // which is exactly what keeps annotation churn out of these keys.
        ...(includeAnnotations ? { annotationVersion: input.annotationVersion } : {}),
        background: 'white',
        format: 'webp',
        includeAnnotations,
        viewport: { kind: 'scale', scale },
      }),
    );
    return { onLattice, canonicalToken };
  }

  /** Throw the 400 the enforcement contract promises, policy attached. */
  rejectOffLattice(): never {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'render request is off the deployment lattice (see renderPolicy; use policy.snap())',
      { details: { renderPolicy: this.policy() } },
    );
  }

  baseKey(tenantId: string, baseSha: string, pageObjectNumber: number, token: string): string {
    return StorageKeys.derivedRenderBase(tenantId, baseSha, pageObjectNumber, token);
  }

  layerKey(
    tenantId: string,
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    token: string,
  ): string {
    return StorageKeys.derivedRenderLayer(tenantId, docId, layerName, pageObjectNumber, token);
  }

  /**
   * The one door. Store hit → serve; miss → `produce` (exactly once per
   * key per process), persist best-effort, serve. A failed persist never
   * fails the response — the artifact is a cache, the bytes in hand are
   * the truth.
   */
  async getOrRender(
    key: string,
    produce: () => Promise<{ bytes: Uint8Array; contentType: string }>,
  ): Promise<DerivedRenderResult> {
    const stored = await this.storage.get(key);
    if (stored) {
      return { bytes: stored, contentType: contentTypeForKey(key), source: 'store' };
    }
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const job = (async (): Promise<DerivedRenderResult> => {
      // Re-check under the flight: a concurrent producer (other replica,
      // or a warm that finished between our miss and now) may have landed.
      const won = await this.storage.get(key);
      if (won) {
        return { bytes: won, contentType: contentTypeForKey(key), source: 'store' };
      }
      const produced = await produce();
      await this.storage
        .put(key, produced.bytes, { contentLength: produced.bytes.byteLength })
        .catch(() => undefined);
      return { bytes: produced.bytes, contentType: produced.contentType, source: 'produced' };
    })().finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, job);
    return job;
  }

  /**
   * Ingest warm: render page ONE's thumbnail lattice point (scale 1,
   * annotations off) through the same door, ad hoc — no live session, the
   * `document.probeSecurityFile` pattern. Fire-and-forget from the commit
   * pipeline; the read-through is the correctness path regardless.
   */
  async warmDocumentThumbnail(input: {
    tenantId: string;
    docId: string;
    baseSha: string;
    /** Object key of the base PDF (the lifecycle's upload key). */
    baseKey: string;
  }): Promise<void> {
    const { cache, pool, encoder, documents } = this;
    if (!cache || !pool || !encoder || !documents) return;

    try {
      const imageOptions: PageImageOptions = {
        viewport: { kind: 'scale', scale: this.thumbnailScale() },
        format: 'webp',
        background: 'white',
        includeAnnotations: false,
      };
      // Base view: content pins are the immutable base epoch.
      const classification = this.classify({
        imageOptions,
        format: 'webp',
        contentVersion: 1,
      });
      if (!classification.canonicalToken) return;
      const token = classification.canonicalToken;

      const handle = await cache.acquire({ sha: input.baseSha, key: input.baseKey });
      try {
        // The artifact key needs page ONE's object number, which only the
        // document knows — so the warm renders first, keys second. A read
        // arriving in that sub-window may render the same point once more
        // (same acceptance as cross-replica duplicates); the store and the
        // per-key flight converge on one artifact either way.
        const payload = await pool.runAdHoc(input.baseSha, (jobId) =>
          wirePack({
            kind: 'document.renderPageFile' as const,
            jobId,
            path: handle.path,
            password: null,
            pageIndex: 0,
            options: pageRenderOptionsFromImageOptions(imageOptions, false),
          }),
        );
        if (payload.tag !== 'document.renderPageFile') {
          throw new EngineError(
            EngineErrorCode.WireFormat,
            `unexpected renderPageFile payload: ${payload.tag}`,
          );
        }
        const encoded = await encoder.encodeToBuffer(payload.raster, { format: 'webp' });
        const finalKey = this.baseKey(
          input.tenantId,
          input.baseSha,
          payload.pageObjectNumber,
          token,
        );
        await this.getOrRender(finalKey, async () => ({
          bytes: encoded.bytes,
          contentType: encoded.contentType,
        }));
        await documents.setThumbnail(input.docId, input.tenantId, 'ready', finalKey);
      } finally {
        handle.release();
      }
    } catch {
      await this.documents
        ?.setThumbnail(input.docId, input.tenantId, 'failed')
        .catch(() => undefined);
    }
  }

  /** Smallest lattice scale — the dashboard tile's point. */
  thumbnailScale(): number {
    return Math.min(...this.scales);
  }
}

function contentTypeForKey(key: string): string {
  return key.endsWith('.png') ? 'image/png' : 'image/webp';
}
