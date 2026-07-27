import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  type AnnotationListPageSnapshot,
  type AnnotationListSnapshotAllPages,
  type DocumentAnnotationsService,
  type PageObjectNumber,
  type WeakAnnotationEditSession,
} from '@embedpdf/engine-core/runtime';
import {
  AnnotationListPageSnapshotSchema,
  WeakAnnotationSessionResponseSchema,
  wirePaths,
  type WeakAnnotationSessionResponse,
} from '@embedpdf/engine-core/wire';

import type { ManifestAccessor } from './CloudDocumentHandle';
import type { HttpClient } from '../transport/HttpClient';

export class CloudDocumentAnnotationsService implements DocumentAnnotationsService {
  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
  ) {}

  listRawAll(): AbortablePromise<AnnotationListSnapshotAllPages> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationListSnapshotAllPages>(async (signal) => {
      const manifest = await this.manifest.get(signal);
      const pages = await Promise.all(
        manifest.pages.map((page) => this.readCurrentPage(page.state.pageObjectNumber, signal)),
      );
      return { pages };
    });
  }

  listRaw(pageObjectNumber: PageObjectNumber): AbortablePromise<AnnotationListPageSnapshot> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<AnnotationListPageSnapshot>((signal) =>
      this.readCurrentPage(pageObjectNumber, signal),
    );
  }

  beginWeakEdit(
    pageObjectNumbers: readonly PageObjectNumber[],
  ): AbortablePromise<WeakAnnotationEditSession> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document ${this.docId} is closed`),
      );
    }
    return AbortablePromise.run<WeakAnnotationEditSession>(async (signal) => {
      const response = await this.http.postJson(
        wirePaths.layerWeakAnnotationSession(this.docId, this.layerName),
        { pageObjectNumbers },
        (raw) => WeakAnnotationSessionResponseSchema.parse(raw),
        signal,
      );
      return new CloudWeakAnnotationEditSession(
        this.http,
        this.docId,
        this.layerName,
        () => this.isClosed(),
        response,
      );
    });
  }

  private async readCurrentPage(
    pageObjectNumber: PageObjectNumber,
    signal: AbortSignal,
  ): Promise<AnnotationListPageSnapshot> {
    return this.http.getJson(
      wirePaths.layerPageAnnotationsCurrent(this.docId, this.layerName, pageObjectNumber),
      (raw) => AnnotationListPageSnapshotSchema.parse(raw),
      signal,
    );
  }
}

class CloudWeakAnnotationEditSession implements WeakAnnotationEditSession {
  private response: WeakAnnotationSessionResponse;
  private released = false;

  constructor(
    private readonly http: HttpClient,
    private readonly docId: string,
    private readonly layerName: string,
    private readonly isClosed: () => boolean,
    response: WeakAnnotationSessionResponse,
  ) {
    this.response = response;
  }

  get id(): string {
    return this.response.sessionId;
  }

  get expiresAt(): number {
    return this.response.expiresAt;
  }

  get heartbeatIntervalMs(): number {
    return this.response.heartbeatIntervalMs;
  }

  get pageObjectNumbers(): readonly PageObjectNumber[] {
    return this.response.pageObjectNumbers;
  }

  covers(pageObjectNumber: PageObjectNumber): boolean {
    return this.response.pageObjectNumbers.includes(pageObjectNumber);
  }

  updatePages(pageObjectNumbers: readonly PageObjectNumber[]): AbortablePromise<void> {
    if (this.isClosed() || this.released) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `weak annotation session ${this.id} is closed`),
      );
    }
    return AbortablePromise.run<void>(async (signal) => {
      this.response = await this.http.postJson(
        wirePaths.layerWeakAnnotationSessionPages(this.docId, this.layerName, this.id),
        { pageObjectNumbers },
        (raw) => WeakAnnotationSessionResponseSchema.parse(raw),
        signal,
      );
    });
  }

  heartbeat(): AbortablePromise<void> {
    if (this.isClosed() || this.released) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `weak annotation session ${this.id} is closed`),
      );
    }
    return AbortablePromise.run<void>(async (signal) => {
      this.response = await this.http.postJson(
        wirePaths.layerWeakAnnotationSessionHeartbeat(this.docId, this.layerName, this.id),
        {},
        (raw) => WeakAnnotationSessionResponseSchema.parse(raw),
        signal,
      );
    });
  }

  release(): AbortablePromise<void> {
    if (this.released) {
      return AbortablePromise.resolveValue(undefined);
    }
    this.released = true;
    return AbortablePromise.run<void>((signal) =>
      this.http.deleteEmpty(
        wirePaths.layerWeakAnnotationSessionRelease(this.docId, this.layerName, this.id),
        signal,
      ),
    );
  }
}
