import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  TEXT_WRITING_CAPABILITIES,
  downloadableProgram,
  fontListOf,
  fontResolutionOf,
  listedProgram,
  wirePack,
  type DocumentSetFontSettingsWorkerRequest,
  type FontEmbeddingPolicy,
  type FontList,
  type FontListFacts,
  type FontProgramInfo,
  type FontResolution,
  type FontResolveRequest,
  type LocalDocumentFontsService as LocalDocumentFontsServiceContract,
  type SessionEventPublisher,
  type WorkerJobRequest,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId } from '../worker/protocol';
import type { JobQueue, JobSpec } from '../worker/WorkerQueue';

type CoreFonts = typeof import('@embedpdf/core-fonts');

/**
 * The standard faces and the last resort, as a browser mounts them. Loaded the
 * first time a document's fonts are asked for: a page that never asks keeps
 * them out of the engine's entry.
 */
let coreFonts: Promise<CoreFonts> | null = null;
const loadCoreFonts = (): Promise<CoreFonts> => (coreFonts ??= import('@embedpdf/core-fonts'));

/**
 * `queue`, telling `publisher` of each write the worker says changed the
 * fonts the document's list shows (`fontsChanged`): that write's events end
 * with `fonts.changed`.
 */
export function noticingFontChanges(queue: JobQueue, publisher: SessionEventPublisher): JobQueue {
  return {
    enqueue: <R extends WorkerResultPayload>(spec: JobSpec): AbortablePromise<R> =>
      AbortablePromise.run<R>(async (signal) => {
        const submission = queue.enqueue<R>(spec);
        const onAbort = () => submission.abort(signal.reason);
        if (signal.aborted) onAbort();
        else signal.addEventListener('abort', onAbort, { once: true });
        const payload = await submission;
        const opId = fontsChangedBy(payload);
        if (opId !== null) publisher.noteFontsChanged(opId);
        return payload;
      }),
  };
}

/** The `opId` of a write whose payload says it changed the fonts; null for any other. */
function fontsChangedBy(payload: WorkerResultPayload): string | null {
  if (!('fontsChanged' in payload) || !payload.fontsChanged || !('result' in payload)) return null;
  const { meta } = payload.result as { meta?: { opId?: unknown } };
  return typeof meta?.opId === 'string' ? meta.opId : null;
}

/**
 * A document's fonts on the local engine: the list, resolve and programs
 * from the worker's walk of the document and its registry, named by
 * engine-core's rules, and this session's font settings. The standard faces
 * and the last resort come from `@embedpdf/core-fonts`, as a browser mounts
 * them.
 */
export class LocalDocumentFontsService implements LocalDocumentFontsServiceContract {
  constructor(
    private readonly docId: string,
    private readonly queue: JobQueue,
    private readonly view: { isClosed(): boolean },
    private readonly guard: ScopeGuard,
    private readonly layerName?: string,
  ) {}

  list(): AbortablePromise<FontList> {
    return this.run(async (signal) => {
      const [facts, fonts] = await Promise.all([this.readFacts(signal), loadCoreFonts()]);
      return fontListOf(facts, fonts.BUILT_IN_PROGRAMS);
    });
  }

  resolve(request: FontResolveRequest): AbortablePromise<FontResolution> {
    return this.run(async (signal) => {
      const payload = await this.request(
        {
          kind: 'document.fonts.resolve',
          runs: request.runs,
          ...(request.annotation ? { annotation: request.annotation } : {}),
        },
        'document.fonts.resolve',
        signal,
      );
      const fonts = await loadCoreFonts();
      return fontResolutionOf(
        payload.runs,
        payload.missingCharacters,
        payload.facts,
        fonts.BUILT_IN_PROGRAMS,
      );
    });
  }

  getProgram(displayHash: string): AbortablePromise<FontProgramInfo> {
    return this.run(async (signal) => {
      const fonts = await loadCoreFonts();
      const builtIn = fonts.builtInProgramInfo(displayHash);
      if (builtIn) return builtIn;
      const program = listedProgram(await this.listOf(fonts, signal), displayHash);
      const info = await this.request(
        { kind: 'document.fonts.program', displayHash, part: 'info' },
        'document.fonts.program',
        signal,
      );
      return { ...program, covers: info.covers, ascent: info.ascent, descent: info.descent };
    });
  }

  downloadProgram(displayHash: string): AbortablePromise<Uint8Array> {
    return this.run(async (signal) => {
      this.guard.assertAnyCapability(TEXT_WRITING_CAPABILITIES);
      const fonts = await loadCoreFonts();
      const builtIn = fonts.loadBuiltInProgram(displayHash);
      if (builtIn) return builtIn;
      downloadableProgram(await this.listOf(fonts, signal), displayHash);
      const payload = await this.request(
        { kind: 'document.fonts.program', displayHash, part: 'data' },
        'document.fonts.program',
        signal,
      );
      if (!payload.bytes) {
        throw new EngineError(EngineErrorCode.WireFormat, 'the program came back without bytes');
      }
      return new Uint8Array(payload.bytes);
    });
  }

  setEmbeddingPolicy(policy: FontEmbeddingPolicy): AbortablePromise<void> {
    return this.sendSettings({ embeddingPolicy: policy });
  }

  setTypographicFeatures(enabled: boolean): AbortablePromise<void> {
    return this.sendSettings({ typographicFeatures: enabled });
  }

  private sendSettings(
    settings: Omit<
      DocumentSetFontSettingsWorkerRequest,
      'kind' | 'effect' | 'jobId' | 'docId' | 'layerName'
    >,
  ): AbortablePromise<void> {
    return this.run(async (signal) => {
      const submission = this.queue.enqueue<WorkerResultPayload>({
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'document.setFontSettings',
            effect: 'session',
            jobId,
            docId: this.docId,
            ...(this.layerName !== undefined ? { layerName: this.layerName } : {}),
            ...settings,
          }),
      });
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
      const payload = await submission;
      if (payload.tag !== 'document.setFontSettings') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
    });
  }

  private async listOf(fonts: CoreFonts, signal: AbortSignal): Promise<FontList> {
    return fontListOf(await this.readFacts(signal), fonts.BUILT_IN_PROGRAMS);
  }

  private async readFacts(signal?: AbortSignal): Promise<FontListFacts> {
    const payload = await this.request(
      { kind: 'document.fonts.list' },
      'document.fonts.list',
      signal,
    );
    return payload.facts;
  }

  /** One read on the worker: its payload, checked to be the one asked for. */
  private async request<Tag extends WorkerResultPayload['tag']>(
    request: DistributiveOmit<
      Extract<WorkerJobRequest, { kind: Tag }>,
      'effect' | 'jobId' | 'docId' | 'layerName'
    >,
    tag: Tag,
    signal?: AbortSignal,
  ): Promise<Extract<WorkerResultPayload, { tag: Tag }>> {
    const submission = this.queue.enqueue<WorkerResultPayload>({
      buildPack: (jobId: JobId) =>
        wirePack({
          ...request,
          effect: 'read',
          jobId,
          docId: this.docId,
          ...(this.layerName !== undefined ? { layerName: this.layerName } : {}),
        } as WorkerJobRequest),
    });
    if (signal) {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    const payload = await submission;
    if (payload.tag !== tag) {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
    }
    return payload as Extract<WorkerResultPayload, { tag: Tag }>;
  }

  private run<T>(body: (signal: AbortSignal) => Promise<T>): AbortablePromise<T> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    try {
      this.guard.assertCapability('doc.open');
    } catch (error) {
      return AbortablePromise.rejectReason(error);
    }
    return AbortablePromise.run<T>(body);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
