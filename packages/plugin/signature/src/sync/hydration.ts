/**
 * The facts: re-reading the snapshot and judging the signatures. The
 * viewer judges the WORKING COPY by default (unsaved edits count); an edit
 * that turns a held signature invalid warns once, on the edge.
 */
import { PluginError } from '@embedpdf/core';
import {
  validateSignatures,
  type SignatureVerdict,
  type ValidationTime,
} from '@embedpdf/core-signature';
import type {
  AnalyzeInput,
  ChangeAnalysis,
  SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';

import type { SignatureCapability, SignatureConfig, SignatureFieldAddress } from '../contract';
import type { SignatureReads } from '../read/signatures';
import type { SignatureContext, SignatureServices } from '../services';

const sameProtection = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function createHydration(
  ctx: SignatureContext,
  { events, store }: Pick<SignatureServices, 'events' | 'store'>,
  config: SignatureConfig,
  { getSignature, getVerdict }: Pick<SignatureReads, 'getSignature' | 'getVerdict'>,
) {
  const { validated, protectionChanged, invalidating } = events;
  const { state, setStatus, requireSignatures } = store;

  const refresh = async (): Promise<SignatureSnapshot | null> => {
    const doc = ctx.doc;
    if (!doc?.signatures) {
      ctx.dispatch({ type: 'SNAPSHOT', snapshot: null });
      return null;
    }
    const before = state().snapshot?.protection ?? null;
    if (!state().snapshot) setStatus('loading');
    let snapshot: SignatureSnapshot;
    try {
      snapshot = await doc.signatures.list();
    } catch (error) {
      setStatus('error');
      throw error;
    }
    ctx.dispatch({ type: 'SNAPSHOT', snapshot });
    setStatus('ready');
    if (!sameProtection(before, snapshot.protection)) {
      protectionChanged.emit({ protection: snapshot.protection });
    }
    return snapshot;
  };

  const validate = async (opts?: {
    at?: ValidationTime;
    until?: 'persisted' | 'working-copy';
  }): Promise<SignatureVerdict[]> => {
    const doc = ctx.doc;
    if (!doc?.signatures) return [];
    const verdicts = await validateSignatures(doc, {
      trust: config.trust ?? null,
      at: opts?.at,
      until: opts?.until ?? 'working-copy',
    });
    const before = state().verdicts;
    ctx.dispatch({ type: 'VERDICTS', verdicts });
    validated.emit({ verdicts });
    // Acrobat's warning, after the fact and only on the edge: a signature that
    // held (or was never judged) now reads invalid because of unsaved edits.
    for (const v of verdicts) {
      if (v.modifications.basis !== 'working-copy' || v.summary !== 'invalid') continue;
      const was = before?.find((b) => b.signature.index === v.signature.index);
      if (was && was.summary === 'invalid') continue;
      invalidating.emit({ field: v.signature.field, detail: v.modifications.detail ?? '' });
    }
    return verdicts;
  };

  const validateField = async (
    field: SignatureFieldAddress,
    opts?: { at?: ValidationTime; until?: 'persisted' | 'working-copy' },
  ): Promise<SignatureVerdict> => {
    await validate(opts);
    const verdict = getVerdict(field);
    if (!verdict) {
      throw new PluginError('not-found', 'signature', 'no signed field at that address');
    }
    return verdict;
  };

  // Every edit that could count as a modification re-judges the working copy.
  // Coalesced: a pen stroke is many events, one analysis.
  let revalidateTimer: ReturnType<typeof setTimeout> | null = null;
  const revalidateSoon = (): void => {
    if (!state().snapshot?.signatures.some((s) => s.signed)) return;
    if (revalidateTimer) clearTimeout(revalidateTimer);
    revalidateTimer = setTimeout(() => {
      revalidateTimer = null;
      void validate().catch((error) =>
        globalThis.console?.error('[signature] re-validation failed:', error),
      );
    }, 300);
  };
  ctx.cleanup(() => {
    if (revalidateTimer) clearTimeout(revalidateTimer);
  });

  const analyzeChanges = (input: AnalyzeInput): Promise<ChangeAnalysis> =>
    requireSignatures().signatures.analyze(input);

  const readRevision = (
    target: SignatureFieldAddress | { revisionIndex: number },
  ): Promise<Uint8Array> => {
    const { signatures } = requireSignatures();
    if ('revisionIndex' in target) return signatures.revisionBytes(target.revisionIndex);
    const signature = getSignature(target);
    if (!signature?.signed || signature.revisionIndex === null) {
      return Promise.reject(
        new PluginError('not-found', 'signature', 'no signed revision at that address'),
      );
    }
    return signatures.revisionBytes(signature.revisionIndex);
  };

  return {
    refresh,
    validate,
    revalidateSoon,
    api: {
      refresh,
      validate,
      validateField,
      analyzeChanges,
      readRevision,
    } satisfies Partial<SignatureCapability>,
  };
}
export type SignatureHydration = ReturnType<typeof createHydration>;
