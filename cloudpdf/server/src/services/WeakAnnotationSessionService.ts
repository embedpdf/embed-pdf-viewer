import { randomUUID } from 'node:crypto';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  WeakAnnotationSessionRow,
  WeakAnnotationSessionScope,
  WeakAnnotationSessionsRepo,
} from '../db/repos/weak_annotation_sessions.repo';

export interface WeakAnnotationSessionServiceOptions {
  repo: WeakAnnotationSessionsRepo;
  ttlMs?: number;
  heartbeatIntervalMs?: number;
}

export interface WeakAnnotationSessionContext {
  tenantId: string;
  sub: string;
}

export interface WeakAnnotationSessionResult {
  sessionId: string;
  expiresAt: number;
  heartbeatIntervalMs: number;
  pageObjectNumbers: number[];
}

export class WeakAnnotationSessionService {
  private readonly repo: WeakAnnotationSessionsRepo;
  private readonly ttlMs: number;
  private readonly heartbeatIntervalMs: number;

  constructor(opts: WeakAnnotationSessionServiceOptions) {
    this.repo = opts.repo;
    this.ttlMs = opts.ttlMs ?? 30_000;
    this.heartbeatIntervalMs = opts.heartbeatIntervalMs ?? 10_000;
  }

  async begin(
    ctx: WeakAnnotationSessionContext,
    input: {
      docId: string;
      layerName: string;
      pageObjectNumbers: readonly number[];
    },
  ): Promise<WeakAnnotationSessionResult> {
    const expiresAt = Date.now() + this.ttlMs;
    const session = await this.repo.create({
      id: `weakann_${randomUUID()}`,
      tenantId: ctx.tenantId,
      docId: input.docId,
      layerName: input.layerName,
      sub: ctx.sub,
      pageObjectNumbers: normalizedPageObjectNumbers(input.pageObjectNumbers),
      expiresAt,
    });
    return this.toResult(session, await this.repo.pageObjectNumbers(session.id));
  }

  async updatePages(
    ctx: WeakAnnotationSessionContext,
    input: {
      docId: string;
      layerName: string;
      sessionId: string;
      pageObjectNumbers: readonly number[];
    },
  ): Promise<WeakAnnotationSessionResult> {
    const session = await this.requireOwned(ctx, input);
    const expiresAt = Date.now() + this.ttlMs;
    await this.repo.updatePages(
      session,
      normalizedPageObjectNumbers(input.pageObjectNumbers),
      expiresAt,
    );
    return this.toResult({ ...session, expiresAt }, await this.repo.pageObjectNumbers(session.id));
  }

  async heartbeat(
    ctx: WeakAnnotationSessionContext,
    input: {
      docId: string;
      layerName: string;
      sessionId: string;
    },
  ): Promise<WeakAnnotationSessionResult> {
    const session = await this.requireOwned(ctx, input);
    const expiresAt = Date.now() + this.ttlMs;
    await this.repo.heartbeat(session, expiresAt);
    return this.toResult({ ...session, expiresAt }, await this.repo.pageObjectNumbers(session.id));
  }

  async release(
    ctx: WeakAnnotationSessionContext,
    input: {
      docId: string;
      layerName: string;
      sessionId: string;
    },
  ): Promise<void> {
    const session = await this.repo.findOwned(this.scope(ctx, input), input.sessionId, ctx.sub);
    if (!session) return;
    await this.repo.release(session.id);
  }

  async assertSoleEditorForWeakPage(input: {
    tenantId: string;
    docId: string;
    layerName: string;
    sub: string;
    pageObjectNumber: number;
  }): Promise<void> {
    const editors = await this.repo.activeEditorsForPage(
      { tenantId: input.tenantId, docId: input.docId, layerName: input.layerName },
      input.pageObjectNumber,
      Date.now(),
    );
    if (editors.length === 1 && editors[0] === input.sub) {
      return;
    }
    throw new EngineError(
      EngineErrorCode.WeakAnnotationSessionConflict,
      `weak annotation edit session required for page ${input.pageObjectNumber}`,
      {
        details: {
          pageObjectNumber: input.pageObjectNumber,
          activeEditorCount: editors.length,
          requesterHasSession: editors.includes(input.sub),
        },
      },
    );
  }

  private async requireOwned(
    ctx: WeakAnnotationSessionContext,
    input: { docId: string; layerName: string; sessionId: string },
  ): Promise<WeakAnnotationSessionRow> {
    const session = await this.repo.findOwned(this.scope(ctx, input), input.sessionId, ctx.sub);
    if (!session || session.expiresAt <= Date.now()) {
      throw new EngineError(
        EngineErrorCode.WeakAnnotationSessionConflict,
        `weak annotation edit session is not active: ${input.sessionId}`,
      );
    }
    return session;
  }

  private scope(
    ctx: WeakAnnotationSessionContext,
    input: { docId: string; layerName: string },
  ): WeakAnnotationSessionScope {
    return { tenantId: ctx.tenantId, docId: input.docId, layerName: input.layerName };
  }

  private toResult(
    session: WeakAnnotationSessionRow,
    pageObjectNumbers: number[],
  ): WeakAnnotationSessionResult {
    return {
      sessionId: session.id,
      expiresAt: session.expiresAt,
      heartbeatIntervalMs: this.heartbeatIntervalMs,
      pageObjectNumbers,
    };
  }
}

function normalizedPageObjectNumbers(pageObjectNumbers: readonly number[]): number[] {
  return [...new Set(pageObjectNumbers)].filter(
    (pageObjectNumber) => Number.isInteger(pageObjectNumber) && pageObjectNumber > 0,
  );
}
