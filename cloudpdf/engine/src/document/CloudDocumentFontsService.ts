import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  downloadableProgram,
  type DocumentFontsService,
  type FontList,
  type FontProgramInfo,
  type FontResolution,
  type FontResolveRequest,
} from '@embedpdf/engine-core/runtime';
import {
  FontListSchema,
  FontProgramInfoSchema,
  FontResolutionSchema,
  wirePaths,
} from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import { planesInherited } from './planes';
import type { HttpClient } from '../transport/HttpClient';

/**
 * A document's fonts on the cloud (`doc.fonts`). The list is a leaf pinned by
 * the manifest's `fontsVersion` and the server's fonts (`serverFonts`), the
 * base's shared URL while the layer draws what the base does; a program's
 * facts are content-addressed by its display hash. A served server font's
 * bytes come from its one URL for every document, so a browser keeps one
 * copy. What each font allows the server decides, by the rules the local
 * engine uses (`fontListOf`).
 */
export class CloudDocumentFontsService implements DocumentFontsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  list(): AbortablePromise<FontList> {
    return this.run((signal) => this.listOf(signal));
  }

  resolve(request: FontResolveRequest): AbortablePromise<FontResolution> {
    return this.run((signal) =>
      this.http.postJson(
        wirePaths.layerFontsResolve(this.docId, this.layerName),
        request,
        (raw) => FontResolutionSchema.parse(raw),
        signal,
      ),
    );
  }

  getProgram(displayHash: string): AbortablePromise<FontProgramInfo> {
    return this.run((signal) =>
      this.http.getJson(
        wirePaths.layerFontProgram(this.docId, this.layerName, displayHash),
        (raw) => FontProgramInfoSchema.parse(raw),
        signal,
      ),
    );
  }

  downloadProgram(displayHash: string): AbortablePromise<Uint8Array> {
    return this.run(async (signal) => {
      const list = await this.listOf(signal);
      downloadableProgram(list, displayHash);
      const serverFont = list.fonts.some(
        (font) =>
          font.source === 'engine' &&
          font.programs.some((program) => program.displayHash === displayHash),
      );
      return this.http.getBytes(
        serverFont
          ? wirePaths.fontProgramFile(displayHash)
          : wirePaths.layerFontProgramFile(this.docId, this.layerName, displayHash),
        signal,
      );
    });
  }

  private listOf(signal: AbortSignal): Promise<FontList> {
    const buildPath = async (s: AbortSignal): Promise<string> => {
      const manifest = await this.manifest.get(s);
      const token = { fontsVersion: manifest.fontsVersion, serverFonts: manifest.serverFonts };
      // A document's fonts are wherever its drawings are: while the layer
      // inherits its pages, annotations and form, it has the base's.
      return planesInherited(manifest, ['content', 'annotations', 'forms'])
        ? wirePaths.docFonts(this.docId, token)
        : wirePaths.layerFonts(this.docId, this.layerName, token);
    };
    return this.http.getJsonWithRefresh(
      buildPath,
      (raw) => FontListSchema.parse(raw),
      async (s) => {
        await this.manifest.refresh(s);
      },
      signal,
    );
  }

  private run<T>(body: (signal: AbortSignal) => Promise<T>): AbortablePromise<T> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<T>(body);
  }
}
