import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  STANDARD_FONTS,
  fontListOf,
  fontResolutionOf,
  wirePack,
  type BuiltInPrograms,
  type CodePointRange,
  type DocumentEvent,
  type DocumentSetFontSettingsWorkerRequest,
  type EventHub,
  type FontEmbeddingPolicy,
  type FontList,
  type FontListFacts,
  type FontProgram,
  type FontProgramInfo,
  type FontResolution,
  type FontResolveRequest,
  type LocalDocumentFontsService as LocalDocumentFontsServiceContract,
  type SessionEventPublisher,
  type StandardFont,
  type WorkerJobRequest,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import type { JobId } from '../worker/protocol';
import type { JobQueue } from '../worker/WorkerQueue';

type CoreFonts = typeof import('@embedpdf/core-fonts');

/**
 * The standard faces and the last resort, as a browser mounts them. Loaded the
 * first time a document's fonts are asked for: a page that never asks keeps
 * them out of the engine's entry.
 */
let coreFonts: Promise<CoreFonts> | null = null;
const loadCoreFonts = (): Promise<CoreFonts> => (coreFonts ??= import('@embedpdf/core-fonts'));

/** The programs the client holds itself: the standard faces' and the last resort's. */
const builtInOf = (fonts: CoreFonts): BuiltInPrograms => ({
  standardDisplayHash: (name) => fonts.standardFontProgram(name).hash,
  lastResortDisplayHash: fonts.LAST_RESORT_HASH,
});

/** Who may have a program's bytes: a session that may write text in the document. */
const WRITES_TEXT = [
  'doc.annotate.modify',
  'doc.forms.fill',
  'doc.forms.modify',
  'doc.redact',
] as const;

/** Every code point the last resort maps: U+0020 up, surrogates left out. */
const LAST_RESORT_COVERS: CodePointRange[] = [
  { start: 0x20, count: 0xd800 - 0x20 },
  { start: 0xe000, count: 0x110000 - 0xe000 },
];

/** Code points, in order, as ranges. */
function rangesOf(codePoints: readonly number[]): CodePointRange[] {
  const ranges: CodePointRange[] = [];
  for (const codePoint of [...codePoints].sort((left, right) => left - right)) {
    const last = ranges[ranges.length - 1];
    if (last && last.start + last.count === codePoint) last.count += 1;
    else if (!last || last.start + last.count < codePoint)
      ranges.push({ start: codePoint, count: 1 });
  }
  return ranges;
}

const standardFontOfHash = (fonts: CoreFonts, hash: string): StandardFont | undefined =>
  STANDARD_FONTS.find((name) => fonts.standardFontProgram(name).hash === hash);

/**
 * Says `fonts.changed` for one open document: when the engine's fonts change,
 * and when a write changed the document's fonts. The second is found by
 * listing them again after a write, once something listed them: a document
 * nobody asked the fonts of pays nothing.
 */
export class DocumentFontsWatch {
  private fingerprint: string | null = null;
  private checking = false;
  private unsubscribe: (() => void) | null = null;
  private readFacts: (() => Promise<FontListFacts>) | null = null;

  constructor(
    private readonly hub: EventHub,
    private readonly publisher: SessionEventPublisher,
    private readonly isClosed: () => boolean,
  ) {}

  /** A list was read: from now on, writes are checked against it. */
  listed(facts: FontListFacts, readFacts: () => Promise<FontListFacts>): void {
    this.fingerprint = JSON.stringify(facts);
    this.readFacts = readFacts;
    this.unsubscribe ??= this.hub.subscribe((event) => {
      if (event.type !== 'fonts.changed' && 'origin' in event) this.check(event);
    });
  }

  /** The engine's fonts changed, so every open document's list did. */
  engineFontsChanged(): void {
    if (this.isClosed()) return;
    // The next list re-arms the check against writes.
    this.fingerprint = null;
    this.publisher.publishFact({ type: 'fonts.changed' });
  }

  close(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  // One check per write: its events arrive together, the check after them.
  private check(event: Extract<DocumentEvent, { origin: unknown }>): void {
    const readFacts = this.readFacts;
    if (this.checking || this.fingerprint === null || !readFacts) return;
    this.checking = true;
    queueMicrotask(() => {
      this.checking = false;
      readFacts().then(
        (facts) => {
          const fingerprint = JSON.stringify(facts);
          if (this.isClosed() || this.fingerprint === null || fingerprint === this.fingerprint) {
            return;
          }
          this.fingerprint = fingerprint;
          this.hub.publish({ type: 'fonts.changed', origin: event.origin });
        },
        // A failed read is the next list's to report.
        () => {},
      );
    });
  }
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
    private readonly watch: DocumentFontsWatch,
    private readonly layerName?: string,
  ) {}

  list(): AbortablePromise<FontList> {
    return this.run(async (signal) => {
      const [facts, fonts] = await Promise.all([this.readFacts(signal), loadCoreFonts()]);
      this.watch.listed(facts, () => this.readFacts());
      return fontListOf(facts, builtInOf(fonts));
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
        builtInOf(fonts),
      );
    });
  }

  getProgram(displayHash: string): AbortablePromise<FontProgramInfo> {
    return this.run(async (signal) => {
      const fonts = await loadCoreFonts();
      const builtIn = builtInProgramInfo(fonts, displayHash);
      if (builtIn) return builtIn;
      const program = await this.programNamed(fonts, displayHash, signal);
      const info = await this.request(
        { kind: 'document.fonts.program', sha256: displayHash, part: 'info' },
        'document.fonts.program',
        signal,
      );
      return { ...program, covers: info.covers, ascent: info.ascent, descent: info.descent };
    });
  }

  downloadProgram(displayHash: string): AbortablePromise<Uint8Array> {
    return this.run(async (signal) => {
      this.guard.assertAnyCapability(WRITES_TEXT);
      const fonts = await loadCoreFonts();
      const standard = standardFontOfHash(fonts, displayHash);
      if (standard) return fonts.standardFontProgram(standard).load();
      if (displayHash === fonts.LAST_RESORT_HASH) return fonts.lastResortFontProgram().load();
      const program = await this.programNamed(fonts, displayHash, signal);
      if (!program.canDownload) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `the program ${displayHash} can't be downloaded`,
          { details: { field: 'displayHash' } },
        );
      }
      const payload = await this.request(
        { kind: 'document.fonts.program', sha256: displayHash, part: 'data' },
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

  /** The program a document font or an engine font names, as the list describes it. */
  private async programNamed(
    fonts: CoreFonts,
    displayHash: string,
    signal: AbortSignal,
  ): Promise<FontProgram> {
    const list = fontListOf(await this.readFacts(signal), builtInOf(fonts));
    const program = list.fonts
      .flatMap((font) => font.programs)
      .find((candidate) => candidate.displayHash === displayHash);
    if (!program) {
      throw new EngineError(
        EngineErrorCode.NotFound,
        `no font in this document has the program ${displayHash}`,
      );
    }
    return program;
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

/** A built-in program's facts: a standard face's or the last resort's; undefined for any other hash. */
function builtInProgramInfo(fonts: CoreFonts, displayHash: string): FontProgramInfo | undefined {
  const standard = standardFontOfHash(fonts, displayHash);
  const program: FontProgram = {
    displayHash,
    sourceHash: null,
    embedded: 'none',
    format: null,
    embeddingPermission: null,
    canDownload: true,
  };
  if (standard) {
    const metrics = fonts.standardFontMetrics(standard);
    return {
      ...program,
      covers: rangesOf(metrics.codePoints),
      ascent: metrics.ascent,
      descent: metrics.descent,
    };
  }
  if (displayHash === fonts.LAST_RESORT_HASH) {
    return {
      ...program,
      format: 'truetype',
      embeddingPermission: 'installable',
      covers: LAST_RESORT_COVERS,
      ascent: 800,
      descent: -200,
    };
  }
  return undefined;
}
