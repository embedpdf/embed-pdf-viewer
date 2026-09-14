/**
 * Digital signatures.
 *
 *   Layer reads (versioned `@token` twin + current form, one handler each):
 *     GET  /v1/docs/:docId/layers/:layerName/signatures[@docVersion]
 *     GET  /v1/docs/:docId/layers/:layerName/signatures/analysis[@token]
 *   Mutations (current only; never cached):
 *     POST   …/signatures/prepare                 multipart envelope (JSON body + resource:appearance)
 *     POST   …/signatures/:signingId/complete     JSON { cms: base64, expectedVersion }
 *     DELETE …/signatures/:signingId
 *   Version-scoped reads (content-addressed by base sha; immutable; the
 *   RESOURCE comes before the sha so each family keeps its own CDN prefix):
 *     GET  /v1/docs/:docId/versions                                   the catalog (no-store)
 *     GET  /v1/docs/:docId/versions/signatures/:sha
 *     GET  /v1/docs/:docId/versions/signatures/:sha/:fieldKey/contents
 *     GET  /v1/docs/:docId/versions/signatures/:sha/:fieldKey/digest/:algorithm
 *     GET  /v1/docs/:docId/versions/analysis/:sha?since.signature=|since.revision=&until=&level=
 *     GET  /v1/docs/:docId/versions/download/:sha
 *     GET  /v1/docs/:docId/versions/revisions/:sha/:index
 *
 * A version is not a layer: version reads open the version's file into a
 * transient session, never a layer session.
 */
import { createReadStream } from 'node:fs';

import {
  EngineError,
  EngineErrorCode,
  SIGNATURE_POLICY_VERSION,
  wirePack,
  type AnalyzeInput,
  type ChangeAnalysis,
  type DigestAlgorithm,
  type FormFieldRef,
  type SignaturePrepareInput,
  type WorkerJobId,
} from '@embedpdf/engine-core/runtime';
import {
  decodeAnalysisToken,
  decodeDocToken,
  decodeTokenText,
  fromBase64,
  LayerAnalysisQuerySchema,
  SignatureCompleteBodySchema,
  SignaturePrepareBodySchema,
  VersionAnalysisQuerySchema,
  analyzeInputFromQuery,
  encodePrepared,
} from '@embedpdf/engine-core/wire';
import type { FastifyInstance, FastifyReply } from 'fastify';

import {
  abortSignalFromRequest,
  parseOrInvalidArg,
  parseTokenOrInvalidArg,
  setImmutableCache,
  setNoStore,
  type SchemaLike,
} from './_helpers';
import { readMutationEnvelope } from './_mutationEnvelope';
import {
  requireDocAccessOnly,
  requireLayerCapability,
  requireLayerDocAccessOnly,
  requireLayerResource,
  requireResource,
} from '../app/jwt-plugin';
import type { DocumentService, OpenContext } from '../services/DocumentService';
import type { LayerService } from '../services/LayerService';

interface SignatureRouteDeps {
  service: DocumentService;
  layerService: LayerService;
}

const SHA256_RE = /^[0-9a-f]{64}$/;
const DIGEST_ALGORITHMS: ReadonlyArray<DigestAlgorithm> = ['sha1', 'sha256', 'sha384', 'sha512'];

export async function registerSignatureRoutes(
  app: FastifyInstance,
  deps: SignatureRouteDeps,
): Promise<void> {
  const { service, layerService } = deps;

  const bitsForLayer = (
    accessCtx: ReturnType<typeof requireLayerDocAccessOnly>,
    docId: string,
    layerName: string,
  ) => service.getEffectivePdfBits(accessCtx, docId, layerName);
  const bitsForDoc = (accessCtx: ReturnType<typeof requireDocAccessOnly>, docId: string) =>
    service.getEffectivePdfBits(accessCtx, docId);

  const readSignatures = (
    ctx: OpenContext,
    docId: string,
    layerName: string,
    signal: AbortSignal,
  ) => service.readLayerSignatures(ctx, docId, layerName, signal);
  // The layer session was opened on base + artifact and has applied every
  // later write in memory (each one persisted as a new artifact): the
  // layer's state IS the session's working copy, so the analysis
  // snapshots it as one more revision over the loaded bytes.
  const analyzeLayer = (
    ctx: OpenContext,
    docId: string,
    layerName: string,
    input: AnalyzeInput,
    signal: AbortSignal,
  ) => service.analyzeLayerSignatures(ctx, docId, layerName, input, signal);

  // ---- layer reads --------------------------------------------------------

  app.get('/v1/docs/:docId/layers/:layerName/signatures@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    rejectQueryParamsOnTokenUrl(req.query);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-signatures', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeDocToken, token, 'docVersion token');
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    if (requested !== manifest.docVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `signatures version ${requested} no longer current (current=${manifest.docVersion})`,
      );
    }
    setImmutableCache(reply);
    return readSignatures(ctx, docId, layerName, abortSignalFromRequest(req));
  });

  app.get('/v1/docs/:docId/layers/:layerName/signatures', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-signatures', pdfBits);
    setNoStore(reply);
    return readSignatures(ctx, docId, layerName, abortSignalFromRequest(req));
  });

  app.get('/v1/docs/:docId/layers/:layerName/signatures/analysis@:token', async (req, reply) => {
    const { docId, layerName, token } = req.params as {
      docId: string;
      layerName: string;
      token: string;
    };
    rejectQueryParamsOnTokenUrl(req.query);
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-signatures-analysis', pdfBits);
    const requested = parseTokenOrInvalidArg(decodeAnalysisToken, token, 'analysis token');
    requireServedPolicy(reply, requested.policyVersion);
    const manifest = await service.getLayerManifest(ctx, docId, layerName);
    if (requested.docVersion !== manifest.docVersion) {
      setNoStore(reply);
      throw new EngineError(
        EngineErrorCode.NotFound,
        `analysis version ${requested.docVersion} no longer current (current=${manifest.docVersion})`,
      );
    }
    const input: AnalyzeInput = {
      since: requested.since,
      until: 'working-copy',
      ...(requested.exploratoryLevel !== undefined
        ? { exploratoryLevel: requested.exploratoryLevel }
        : {}),
      ...(requested.detail !== undefined ? { detail: requested.detail } : {}),
    };
    // No cache header until the worker has answered: an error response must
    // never carry the immutable header the success path earns.
    const analysis = await analyzeLayer(ctx, docId, layerName, input, abortSignalFromRequest(req));
    return finishAnalysisReply(reply, analysis);
  });

  app.get('/v1/docs/:docId/layers/:layerName/signatures/analysis', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerResource(req, docId, layerName, 'layer-signatures-analysis', pdfBits);
    const query = parseOrInvalidArg(
      LayerAnalysisQuerySchema as unknown as SchemaLike<
        ReturnType<typeof LayerAnalysisQuerySchema.parse>
      >,
      req.query,
      'query',
    );
    setNoStore(reply);
    return analyzeLayer(
      ctx,
      docId,
      layerName,
      analyzeInputFromQuery(query, 'working-copy'),
      abortSignalFromRequest(req),
    );
  });

  // ---- mutations ----------------------------------------------------------

  app.post('/v1/docs/:docId/layers/:layerName/signatures/prepare', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.sign', pdfBits);
    // Appearance artwork is a page of a PDF: the stamp rule (sniffed, never declared).
    const { body, resources } = await readMutationEnvelope(req, () => 'image-or-pdf');
    const parsed = parseOrInvalidArg(
      SignaturePrepareBodySchema as unknown as SchemaLike<
        ReturnType<typeof SignaturePrepareBodySchema.parse>
      >,
      body,
      'request body',
    );
    if (parsed.certify) {
      requireLayerCapability(req, docId, layerName, 'doc.sign.certify', pdfBits);
    }
    const { appearance, signer, ...rest } = parsed;
    const input: SignaturePrepareInput = { ...rest };
    if (!input.attribution && signer) input.attribution = signer;
    if (appearance) {
      const resource = resources?.[appearance.resource];
      if (!resource) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `body references resource '${appearance.resource}' but no such multipart part arrived`,
        );
      }
      if (resource.mimeType !== 'application/pdf') {
        throw new EngineError(EngineErrorCode.InvalidArg, 'the appearance resource must be a PDF');
      }
      input.appearance = {
        pdf: new Uint8Array(resource.bytes),
        ...(appearance.pageIndex !== undefined ? { pageIndex: appearance.pageIndex } : {}),
      };
    }
    setNoStore(reply);
    const prepared = await layerService.prepareSignature(
      ctx,
      { docId, layerName, input },
      abortSignalFromRequest(req),
    );
    return encodePrepared(prepared);
  });

  app.post(
    '/v1/docs/:docId/layers/:layerName/signatures/:signingId/complete',
    async (req, reply) => {
      const { docId, layerName, signingId } = req.params as {
        docId: string;
        layerName: string;
        signingId: string;
      };
      const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
      const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
      const ctx = requireLayerCapability(req, docId, layerName, 'doc.sign', pdfBits);
      const body = parseOrInvalidArg(
        SignatureCompleteBodySchema as unknown as SchemaLike<
          ReturnType<typeof SignatureCompleteBodySchema.parse>
        >,
        req.body,
        'request body',
      );
      let cms: Uint8Array;
      try {
        cms = fromBase64(body.cms);
      } catch {
        throw new EngineError(EngineErrorCode.InvalidArg, 'cms is not valid base64');
      }
      setNoStore(reply);
      return layerService.completeSignature(
        ctx,
        { docId, layerName, signingId, cms, expectedVersion: body.expectedVersion },
        abortSignalFromRequest(req),
      );
    },
  );

  app.delete('/v1/docs/:docId/layers/:layerName/signatures/:signingId', async (req, reply) => {
    const { docId, layerName, signingId } = req.params as {
      docId: string;
      layerName: string;
      signingId: string;
    };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await bitsForLayer(accessCtx, docId, layerName);
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.sign', pdfBits);
    setNoStore(reply);
    return layerService.abortSignature(ctx, { docId, layerName, signingId });
  });

  // ---- version-scoped reads -----------------------------------------------

  app.get('/v1/docs/:docId/versions', async (req, reply) => {
    const { docId } = req.params as { docId: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'versions', pdfBits);
    setNoStore(reply);
    const listed = await service.listVersions(ctx, docId);
    return {
      head: listed.head,
      versions: listed.versions.map((v) => ({
        sha256: v.sha256,
        byteLength: v.byteLength,
        number: v.number,
        parentSha256: v.parentSha256,
        producer: v.producerKind,
        signingId: v.producerRef,
        createdAt: v.createdAt,
      })),
    };
  });

  const versionSignatures = async (
    ctx: OpenContext,
    docId: string,
    sha: string,
    signal: AbortSignal,
  ) => {
    const payload = await service.readVersionOnPool(
      ctx,
      docId,
      sha,
      (sessionId, jobId) => wirePack({ kind: 'signatures.list' as const, jobId, docId: sessionId }),
      signal,
    );
    if (payload.tag !== 'signatures.list') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
    }
    return payload.snapshot;
  };

  app.get('/v1/docs/:docId/versions/signatures/:sha', async (req, reply) => {
    const { docId, sha } = req.params as { docId: string; sha: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'version-signatures', pdfBits);
    const snapshot = await versionSignatures(ctx, docId, requireSha(sha), abortSignalFromRequest(req));
    setImmutableCache(reply);
    return snapshot;
  });

  app.get('/v1/docs/:docId/versions/signatures/:sha/:fieldKey/contents', async (req, reply) => {
    const { docId, sha, fieldKey } = req.params as {
      docId: string;
      sha: string;
      fieldKey: string;
    };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'version-signatures', pdfBits);
    const ref = fieldRefFromPath(fieldKey);
    const payload = await service.readVersionOnPool(
      ctx,
      docId,
      requireSha(sha),
      (sessionId, jobId) =>
        wirePack({ kind: 'signatures.contents' as const, jobId, docId: sessionId, ref }),
      abortSignalFromRequest(req),
    );
    if (payload.tag !== 'signatures.contents') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
    }
    setImmutableCache(reply);
    reply.header('Content-Type', 'application/pkcs7-signature');
    return reply.send(Buffer.from(payload.bytes));
  });

  app.get(
    '/v1/docs/:docId/versions/signatures/:sha/:fieldKey/digest/:algorithm',
    async (req, reply) => {
      const { docId, sha, fieldKey, algorithm } = req.params as {
        docId: string;
        sha: string;
        fieldKey: string;
        algorithm: string;
      };
      const accessCtx = requireDocAccessOnly(req, docId);
      const pdfBits = await bitsForDoc(accessCtx, docId);
      const ctx = requireResource(req, docId, 'version-signatures', pdfBits);
      if (!(DIGEST_ALGORITHMS as readonly string[]).includes(algorithm)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `unknown digest algorithm '${algorithm}'`,
        );
      }
      const ref = fieldRefFromPath(fieldKey);
      const payload = await service.readVersionOnPool(
        ctx,
        docId,
        requireSha(sha),
        (sessionId, jobId) =>
          wirePack({
            kind: 'signatures.digest' as const,
            jobId,
            docId: sessionId,
            ref,
            algorithm: algorithm as DigestAlgorithm,
          }),
        abortSignalFromRequest(req),
      );
      if (payload.tag !== 'signatures.digest') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
      }
      setImmutableCache(reply);
      reply.header('Content-Type', 'application/octet-stream');
      return reply.send(Buffer.from(payload.digest));
    },
  );

  app.get('/v1/docs/:docId/versions/analysis/:sha', async (req, reply) => {
    const { docId, sha } = req.params as { docId: string; sha: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'version-analysis', pdfBits);
    const query = parseOrInvalidArg(
      VersionAnalysisQuerySchema as unknown as SchemaLike<
        ReturnType<typeof VersionAnalysisQuerySchema.parse>
      >,
      req.query,
      'query',
    );
    requireServedPolicy(reply, query.policy);
    const input = analyzeInputFromQuery(
      query,
      query.until !== undefined ? { revisionIndex: query.until } : 'persisted',
    );
    const payload = await service.readVersionOnPool(
      ctx,
      docId,
      requireSha(sha),
      (sessionId, jobId) =>
        wirePack({ kind: 'signatures.analyze' as const, jobId, docId: sessionId, input }),
      abortSignalFromRequest(req),
    );
    if (payload.tag !== 'signatures.analyze') {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload: ${payload.tag}`);
    }
    return finishAnalysisReply(reply, payload.analysis);
  });

  app.get('/v1/docs/:docId/versions/download/:sha', async (req, reply) => {
    const { docId, sha } = req.params as { docId: string; sha: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'version-download', pdfBits);
    const version = await service.requireVersion(ctx, docId, requireSha(sha));
    const file = await service.acquireBaseFileFor(ctx, docId, version.sha256);
    return sendVersionBytes(reply, file, version.byteLength, `${docId}-v${version.number}.pdf`);
  });

  app.get('/v1/docs/:docId/versions/revisions/:sha/:index', async (req, reply) => {
    const { docId, sha, index } = req.params as { docId: string; sha: string; index: string };
    const accessCtx = requireDocAccessOnly(req, docId);
    const pdfBits = await bitsForDoc(accessCtx, docId);
    const ctx = requireResource(req, docId, 'version-revisions', pdfBits);
    if (!/^(0|[1-9][0-9]*)$/.test(index)) {
      throw new EngineError(
        EngineErrorCode.InvalidArg,
        `revision index must be a non-negative integer`,
      );
    }
    const version = await service.requireVersion(ctx, docId, requireSha(sha));
    const snapshot = await versionSignatures(
      ctx,
      docId,
      version.sha256,
      abortSignalFromRequest(req),
    );
    const revision = snapshot.revisions[Number(index)];
    if (!revision) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no revision ${index} (the version has ${snapshot.revisions.length})`,
      );
    }
    const file = await service.acquireBaseFileFor(ctx, docId, version.sha256);
    return sendVersionBytes(
      reply,
      file,
      revision.end,
      `${docId}-v${version.number}-r${revision.index}.pdf`,
    );
  });
}

function requireSha(raw: string): string {
  if (!SHA256_RE.test(raw)) {
    throw new EngineError(EngineErrorCode.InvalidArg, `malformed version sha '${raw}'`);
  }
  return raw;
}

function fieldRefFromPath(fieldKey: string): FormFieldRef {
  let name: string;
  try {
    name = decodeTokenText(fieldKey);
  } catch {
    throw new EngineError(EngineErrorCode.InvalidArg, `malformed field key '${fieldKey}'`);
  }
  if (name.length === 0) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'field key must not be empty');
  }
  return { kind: 'fqn', name };
}

/**
 * The policy version a caller puts in an analysis URL is the cache key that
 * keeps a verdict judged under one set of rules from being served under
 * another. A request for a policy this server does not run is refused, never
 * answered with the current policy under the requested key.
 */
function requireServedPolicy(reply: FastifyReply, requested: number | undefined): void {
  if (requested !== undefined && requested !== SIGNATURE_POLICY_VERSION) {
    setNoStore(reply);
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `signature policy ${requested} is not served here (current=${SIGNATURE_POLICY_VERSION})`,
    );
  }
}

/**
 * Cache an analysis only when it is a settled, authoritative verdict judged
 * under this server's policy: a worker at another policy (a mixed fleet), an
 * exploratory run, or a verdict that could not be established must not live
 * for a year under an immutable URL.
 */
function finishAnalysisReply(reply: FastifyReply, analysis: ChangeAnalysis): ChangeAnalysis {
  if (analysis.policyVersion !== SIGNATURE_POLICY_VERSION) {
    setNoStore(reply);
    throw new EngineError(
      EngineErrorCode.WireFormat,
      `analysis judged under policy ${analysis.policyVersion}, this server serves ${SIGNATURE_POLICY_VERSION}`,
    );
  }
  if (analysis.mode === 'exploratory' || analysis.verdict === 'indeterminate') {
    setNoStore(reply);
  } else {
    setImmutableCache(reply);
  }
  return analysis;
}

function rejectQueryParamsOnTokenUrl(query: unknown): void {
  if (query && typeof query === 'object' && Object.keys(query).length > 0) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      'versioned URLs encode their options in the path token, not query params',
    );
  }
}

/** Stream `[0, length)` of a held base version file; the handle is released when the response ends. */
function sendVersionBytes(
  reply: FastifyReply,
  file: { path: string; size: number; release(): void },
  length: number,
  filename: string,
) {
  if (length > file.size) {
    file.release();
    throw new EngineError(
      EngineErrorCode.Unknown,
      'the version file is shorter than its catalog says',
    );
  }
  setImmutableCache(reply);
  reply.header('Content-Type', 'application/pdf');
  reply.header('Content-Length', String(length));
  reply.header('Content-Disposition', `attachment; filename="${filename}"`);
  const stream =
    length === 0
      ? createReadStream(file.path, { start: 0, end: 0 })
      : createReadStream(file.path, { start: 0, end: length - 1 });
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    file.release();
  };
  stream.once('close', release);
  stream.once('error', release);
  reply.raw.once('close', release);
  return reply.send(stream);
}
