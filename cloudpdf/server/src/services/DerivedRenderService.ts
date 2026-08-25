import { Buffer } from 'node:buffer';

import {
  EngineError,
  EngineErrorCode,
  wirePack,
  type AnnotationAppearanceImageOptions,
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
import type { EnginePool } from '../runtime/EnginePool';
import { EngineBusyError } from '../runtime/SchedulingEnginePool';
import type { BaseFileCache } from '../storage/BaseFileCache';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';

export interface DerivedRenderServiceOptions {
  storage: ObjectStore;
  /**
   * Full-page width ladder. The bounded quantity is OUTPUT PIXELS, never
   * zoom. Default `[320, 640, 1280, 2560]`.
   */
  widths?: number[];
  /**
   * Annotation-appearance scale lattice. Appearances are sized by
   * `rect × scale`, and — unlike full pages — they must track the page's
   * EFFECTIVE render scale to composite crisply, so their canonical axis
   * is scale, not width. Default `[1, 2, 4]` (couples with the width
   * ladder's ~2× steps). Advertised as `policy().appearances`.
   */
  appearanceScales?: number[];
  /**
   * Worker-side output-pixel budget for EVERY server render (width bounds
   * width, not height — degenerate geometry still explodes vertically).
   * Default 32,000,000 (~32MP). Advertised in the policy.
   */
  maxRenderPixels?: number;
  /**
   * When true, off-lattice VERSIONED FULL-PAGE render tokens are rejected
   * with 400 (`renderPolicy` echoed). Rect-target requests are exempt —
   * they belong to the tile policy once advertised and stay compute-only
   * until then. When false (default until the client stack
   * ships `snapFullPageViewport` everywhere), off-lattice renders are
   * computed but never persisted — no breakage, no storage-DoS surface.
   */
  enforce?: boolean;
  /** Warm-path thumbnails render and encode in one worker operation
   *  (default). `false` = the `CLOUDPDF_ENCODE_IN_ENGINE=0` escape hatch
   *  (raw raster over the boundary + API-side sharp). */
  encodeInEngine?: boolean;
  /** Warm-path deps; optional so route-only tests can skip them. */
  cache?: BaseFileCache;
  pool?: EnginePool;
  encoder?: SharpImageEncoder;
  documents?: DocumentsRepo;
  /**
   * Called when a thumbnail warm fails, right before the document's
   * thumbnail state is recorded as `failed`. Warming is deliberately
   * fire-and-forget, but the cause must not be invisible — wire this
   * to the app logger.
   */
  onWarmError?: (err: unknown, ctx: { docId: string; tenantId: string }) => void;
}

export interface LatticeClassification {
  onLattice: boolean;
  /**
   * Whether this is a FULL-PAGE request (`target` absent or `{kind:
   * 'page'}`). Enforcement applies only to these; rect targets are the
   * (future) tile policy's jurisdiction.
   */
  fullPage: boolean;
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
 * The derived-artifact plane for renders.
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
  private readonly widths: number[];
  private readonly appearanceScales: number[];
  private readonly enforce: boolean;
  private readonly maxPixels: number;
  private readonly cache?: BaseFileCache;
  private readonly pool?: EnginePool;
  private readonly encoder?: SharpImageEncoder;
  private readonly encodeInEngine: boolean;
  private readonly documents?: DocumentsRepo;
  private readonly onWarmError?: (err: unknown, ctx: { docId: string; tenantId: string }) => void;
  private readonly inFlight = new Map<string, Promise<DerivedRenderResult>>();

  constructor(opts: DerivedRenderServiceOptions) {
    this.storage = opts.storage;
    this.widths = opts.widths ?? [320, 640, 1280, 2560];
    this.appearanceScales = opts.appearanceScales ?? [1, 2, 4];
    this.maxPixels = opts.maxRenderPixels ?? 32_000_000;
    this.enforce = opts.enforce ?? false;
    this.cache = opts.cache;
    this.pool = opts.pool;
    this.encoder = opts.encoder;
    this.encodeInEngine = opts.encodeInEngine ?? true;
    this.documents = opts.documents;
    this.onWarmError = opts.onWarmError;
  }

  /** The advertised deployment policy — rides `/v1/access`, never manifests. */
  policy(): RenderPolicy {
    return {
      fullPage: { widths: [...this.widths] },
      // `tiles` is deliberately ABSENT until deep-zoom tile support ships;
      // the schema reserves its shape so the contract never churns.
      appearances: { scales: [...this.appearanceScales] },
      maxRenderPixels: this.maxPixels,
      formats: ['webp'],
      background: 'white',
      enforced: this.enforce,
    };
  }

  get enforced(): boolean {
    return this.enforce;
  }

  /** The output-pixel budget every server render carries into the worker. */
  get maxRenderPixels(): number {
    return this.maxPixels;
  }

  /**
   * Classify a validated render request against the lattice. Conservative
   * by construction: any option outside the enumerated canonical set —
   * rect targets, rotations, quality overrides, png, scale viewports — is
   * off-lattice (computed, never persisted).
   */
  classify(input: {
    imageOptions: PageImageOptions;
    format: PageNetworkRenderFormat;
    /**
     * The render FAMILY the request arrived on (token/path law):
     * annotatedness is path-expressed, so the route supplies it — the
     * token cannot. Drives whether `annotationVersion` belongs in the
     * canonical token (annotation churn stays out of the free family's
     * keys by construction).
     */
    annotated: boolean;
    contentVersion?: number;
    annotationVersion?: number;
  }): LatticeClassification {
    const o = input.imageOptions;
    const viewport = o.viewport;
    const fullPage = o.target === undefined || o.target.kind === 'page';
    const width = viewport?.kind === 'width' ? viewport.width : undefined;
    const onLattice =
      fullPage &&
      width !== undefined &&
      this.widths.includes(width) &&
      input.format === 'webp' &&
      (o.background === undefined || o.background === 'white') &&
      (o.rotation === undefined || o.rotation === 0) &&
      o.quality === undefined;

    if (!onLattice || input.contentVersion === undefined) {
      return { onLattice, fullPage };
    }

    const canonicalToken = encodeRenderToken(
      flatten({
        contentVersion: input.contentVersion,
        ...(input.annotated ? { annotationVersion: input.annotationVersion } : {}),
        background: 'white',
        format: 'webp',
        viewport: { kind: 'width', width },
      }),
    );
    return { onLattice, fullPage, canonicalToken };
  }

  /**
   * Classify an appearance-batch render against the appearance scale
   * lattice. Same conservative construction as `classify`: any option
   * outside the canonical set — off-lattice scale, rotation, quality,
   * non-normal modes, png — is off-lattice. `scale` defaults to 1 (the
   * DTO's documented default), so an unspecified scale is canonical when
   * the lattice contains 1. Durable appearance batches are a fast-follow;
   * until then this feeds enforcement only.
   */
  classifyAppearance(input: {
    imageOptions: AnnotationAppearanceImageOptions;
    format: PageNetworkRenderFormat;
  }): { onLattice: boolean } {
    const o = input.imageOptions;
    const scale = o.scale ?? 1;
    const normalOnly = o.modes === undefined || (o.modes.length === 1 && o.modes[0] === 'normal');
    const onLattice =
      this.appearanceScales.includes(scale) &&
      input.format === 'webp' &&
      (o.rotation === undefined || o.rotation === 0) &&
      o.quality === undefined &&
      normalOnly;
    return { onLattice };
  }

  /**
   * Throw the 400 the enforcement contract promises, policy attached.
   * `hint` names the conformance helper for the rejected surface —
   * identical wording to the local engine's renderPolicyGuard, so the
   * error reads the same whichever engine rejected it.
   */
  rejectOffLattice(hint = 'use snapFullPageViewport(policy, viewport, { pageWidth })'): never {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `render request is off the deployment lattice (see renderPolicy; ${hint})`,
      { details: { renderPolicy: this.policy() } },
    );
  }

  baseKey(
    tenantId: string,
    baseSha: string,
    pageObjectNumber: number,
    token: string,
    annotated = false,
  ): string {
    return StorageKeys.derivedRenderBase(tenantId, baseSha, pageObjectNumber, token, annotated);
  }

  layerKey(
    tenantId: string,
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    token: string,
    annotated = false,
  ): string {
    return StorageKeys.derivedRenderLayer(
      tenantId,
      docId,
      layerName,
      pageObjectNumber,
      token,
      annotated,
    );
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
        viewport: { kind: 'width', width: this.thumbnailWidth() },
        format: 'webp',
        background: 'white',
      };
      // Base view, annotation-free family: content pins are the immutable
      // base epoch.
      const classification = this.classify({
        imageOptions,
        format: 'webp',
        annotated: false,
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
        const renderOptions = {
          ...pageRenderOptionsFromImageOptions(imageOptions, false),
          maxOutputPixels: this.maxPixels,
        };
        // With in-engine encoding (the default), render and encode use one worker op — the
        // thumbnail raster never crosses the engine boundary. Escape
        // hatch keeps the raw-raster op + API-side sharp for one release.
        let encoded: { bytes: Uint8Array; contentType: string };
        let pageObjectNumber: number;
        if (this.encodeInEngine) {
          const payload = await pool.runAdHoc(
            input.baseSha,
            (jobId) =>
              wirePack({
                kind: 'document.renderPageFileEncoded' as const,
                jobId,
                path: handle.path,
                password: null,
                pageIndex: 0,
                options: renderOptions,
                encode: { format: 'webp' as const },
              }),
            undefined,
            { lane: 'background' },
          );
          if (payload.tag !== 'document.renderPageFileEncoded') {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `unexpected renderPageFileEncoded payload: ${payload.tag}`,
            );
          }
          encoded = { bytes: payload.image.bytes, contentType: payload.image.contentType };
          pageObjectNumber = payload.pageObjectNumber;
        } else {
          const payload = await pool.runAdHoc(
            input.baseSha,
            (jobId) =>
              wirePack({
                kind: 'document.renderPageFile' as const,
                jobId,
                path: handle.path,
                password: null,
                pageIndex: 0,
                options: renderOptions,
              }),
            undefined,
            { lane: 'background' },
          );
          if (payload.tag !== 'document.renderPageFile') {
            throw new EngineError(
              EngineErrorCode.WireFormat,
              `unexpected renderPageFile payload: ${payload.tag}`,
            );
          }
          encoded = await encoder.encodeToBuffer(payload.raster, { format: 'webp' });
          pageObjectNumber = payload.pageObjectNumber;
        }
        const finalKey = this.baseKey(input.tenantId, input.baseSha, pageObjectNumber, token);
        await this.getOrRender(finalKey, async () => ({
          bytes: encoded.bytes,
          contentType: encoded.contentType,
        }));
        await documents.setThumbnail(input.docId, input.tenantId, 'ready', finalKey);
      } finally {
        handle.release();
      }
    } catch (err) {
      // A scheduler shed is a deliberate skip of a latency optimization,
      // not an encoding failure: leave the thumbnail state RETRYABLE (the
      // read-through is the system) instead of recording `failed`.
      if (err instanceof EngineBusyError) return;
      this.onWarmError?.(err, { docId: input.docId, tenantId: input.tenantId });
      await this.documents
        ?.setThumbnail(input.docId, input.tenantId, 'failed')
        .catch(() => undefined);
    }
  }

  /** Smallest ladder width — the dashboard tile's point. */
  thumbnailWidth(): number {
    return Math.min(...this.widths);
  }
}

function contentTypeForKey(key: string): string {
  return key.endsWith('.png') ? 'image/png' : 'image/webp';
}
