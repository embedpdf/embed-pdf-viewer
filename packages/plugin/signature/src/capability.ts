import { createEventHook, type PluginContext } from '@embedpdf/core';
import {
  certificateCommonName,
  sign,
  validateSignatures,
  type SignatureVerdict,
  type SignerPort,
  type ValidationTime,
} from '@embedpdf/core-signature';
import {
  resolveBinarySource,
  type AnalyzeInput,
  type BinarySource,
  type ChangeAnalysis,
  type DocumentEvent,
  type DocumentProtection,
  type FormFieldRef,
  type SignatureCompleteResult,
  type SignatureDTO,
  type SignatureSnapshot,
} from '@embedpdf/engine-core/runtime';
import { AnnotationToken, type StampPlacement } from '@embedpdf/plugin-annotation/contract';
import { FormToken } from '@embedpdf/plugin-form/contract';
import { StampToken } from '@embedpdf/plugin-stamp/contract';

import { blankPagePdf } from './blank-page';
import type {
  Mark,
  SignatureAction,
  SignatureCapability,
  SignatureChange,
  SignatureConfig,
  SignatureMode,
  SignatureState,
  SignFieldInput,
} from './types';

const sameRef = (a: FormFieldRef, b: FormFieldRef): boolean =>
  a.kind === 'objectNumber' && b.kind === 'objectNumber'
    ? a.fieldObjectNumber === b.fieldObjectNumber
    : a.kind === 'fqn' && b.kind === 'fqn'
      ? a.name === b.name
      : false;

const sameProtection = (a: DocumentProtection | null, b: DocumentProtection | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b);

export function createSignatureCapability(
  ctx: PluginContext<SignatureState, SignatureAction>,
  config: SignatureConfig = {},
): SignatureCapability {
  const form = ctx.get(FormToken);
  const changed = createEventHook<SignatureChange>((error) =>
    globalThis.console?.error('[signature] listener failed:', error),
  );
  ctx.cleanup(() => changed.dispose());

  const state = () => ctx.getState();
  const requireDoc = () => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[signature] no document bound');
    return doc;
  };
  const requireSignatures = () => {
    const doc = requireDoc();
    if (!doc.signatures) throw new Error('[signature] this engine does not implement signatures');
    return { doc, signatures: doc.signatures };
  };
  const stamp = () => ctx.tryGet(StampToken);
  const documentId = () => {
    const id = ctx.documentId;
    if (!id) throw new Error('[signature] no document id');
    return id;
  };

  // ── mode and signer ─────────────────────────────────────────────────────
  const mode = (): SignatureMode => config.mode ?? (config.signer ? 'sign' : 'visual');
  const resolveSigner = async (): Promise<SignerPort> => {
    const signer = config.signer;
    if (!signer) throw new Error('[signature] no signer configured (mode "sign" needs one)');
    return typeof signer === 'function' ? signer() : signer;
  };
  const allows = (cap: 'doc.sign' | 'doc.sign.certify' | 'doc.forms.fill'): boolean =>
    ctx.doc?.security.allows(cap) ?? false;

  // ── snapshot + verdicts ─────────────────────────────────────────────────
  const refresh = async (): Promise<SignatureSnapshot | null> => {
    const doc = ctx.doc;
    if (!doc?.signatures) {
      ctx.dispatch({ type: 'SNAPSHOT', snapshot: null });
      return null;
    }
    const before = state().snapshot?.protection ?? null;
    const snapshot = await doc.signatures.list();
    ctx.dispatch({ type: 'SNAPSHOT', snapshot });
    if (!sameProtection(before, snapshot.protection)) {
      changed.emit({ type: 'protectionChanged', protection: snapshot.protection });
    }
    return snapshot;
  };

  const validate = async (opts?: { at?: ValidationTime }): Promise<SignatureVerdict[]> => {
    const doc = ctx.doc;
    if (!doc?.signatures) return [];
    const verdicts = await validateSignatures(doc, { trust: config.trust ?? null, at: opts?.at });
    ctx.dispatch({ type: 'VERDICTS', verdicts });
    changed.emit({ type: 'validated', verdicts });
    return verdicts;
  };

  const analyze = (input: AnalyzeInput): Promise<ChangeAnalysis> =>
    requireSignatures().signatures.analyze(input);

  const signatureOf = (
    field: FormFieldRef | { annotObjectNumber: number },
  ): SignatureDTO | null => {
    const snapshot = state().snapshot;
    if (!snapshot) return null;
    if ('annotObjectNumber' in field) {
      const byWidget = snapshot.signatures.find(
        (s) => s.widget?.annotObjectNumber === field.annotObjectNumber,
      );
      if (byWidget) return byWidget;
      const owner = form.fieldForWidget(field.annotObjectNumber);
      return owner ? signatureOf(owner.ref) : null;
    }
    return (
      snapshot.signatures.find((s) =>
        field.kind === 'fqn' ? s.fieldName === field.name : sameRef(s.field, field),
      ) ?? null
    );
  };
  const verdictOf = (
    field: FormFieldRef | { annotObjectNumber: number },
  ): SignatureVerdict | null => {
    const signature = signatureOf(field);
    if (!signature) return null;
    return state().verdicts?.find((v) => v.signature.index === signature.index) ?? null;
  };

  // ── marks → bytes ───────────────────────────────────────────────────────
  const bytesOf = async (source: BinarySource): Promise<Uint8Array> =>
    new Uint8Array((await resolveBinarySource(source)).bytes);
  const markBytes = async (mark: Mark): Promise<Uint8Array> => {
    if ('assetId' in mark) {
      const bytes = stamp()?.assetBytes(mark.assetId);
      if (!bytes) throw new Error(`[signature] unknown mark '${mark.assetId}'`);
      return bytes;
    }
    return bytesOf(mark.source);
  };

  const withBusy = async <T>(work: () => Promise<T>): Promise<T> => {
    ctx.dispatch({ type: 'BUSY', busy: true });
    try {
      return await work();
    } finally {
      ctx.dispatch({ type: 'BUSY', busy: false });
    }
  };

  // ── the act ─────────────────────────────────────────────────────────────
  const signField = (input: SignFieldInput): Promise<SignatureCompleteResult> =>
    withBusy(async () => {
      const { doc } = requireSignatures();
      const signer = await resolveSigner();
      // The certificate's subject is the default /Name; the caller's facts win.
      const subject =
        signer.kind === 'raw' && signer.certificateChain[0]
          ? certificateCommonName(signer.certificateChain[0])
          : null;
      const attribution = { ...(subject ? { name: subject } : {}), ...input.attribution };
      // The appearance IS the mark: its page is drawn into the widget by the engine.
      const appearance = input.appearance
        ? await bytesOf(input.appearance)
        : await markBytes(input.mark);
      const result = await sign(doc, {
        field: input.field,
        signer,
        attribution,
        certify: input.certify,
        lock: input.lock,
        appearance: { pdf: appearance, pageIndex: 0 },
      });
      if (state().target && sameRef(state().target!, input.field)) setTarget(null);
      await refresh();
      void validate().catch((error) =>
        globalThis.console?.error('[signature] validation after signing failed:', error),
      );
      changed.emit({ type: 'signed', field: input.field, result });
      return result;
    });

  const setAppearance = async (field: FormFieldRef, pdf: Uint8Array): Promise<void> => {
    const doc = requireDoc();
    if (!doc.forms.setSignatureAppearance) {
      throw new Error('[signature] this engine cannot draw into a signature field');
    }
    const signature = signatureOf(field);
    if (signature?.signed) throw new Error(`[signature] '${signature.fieldName}' is signed`);
    await doc.forms.setSignatureAppearance(field, { pdf, pageIndex: 0 });
    await form.refresh();
  };

  const fillField = (field: FormFieldRef, mark: Mark): Promise<void> =>
    withBusy(async () => {
      await setAppearance(field, await markBytes(mark));
      if (state().target && sameRef(state().target!, field)) setTarget(null);
      changed.emit({ type: 'filled', field });
    });

  const clearField = (field: FormFieldRef): Promise<void> =>
    withBusy(async () => {
      await setAppearance(field, blankPagePdf());
      changed.emit({ type: 'cleared', field });
    });

  const placeMark = async (
    mark: Mark,
    target: { field: FormFieldRef } | StampPlacement,
  ): Promise<void> => {
    if (!('field' in target)) {
      // Free placement: a stamp, as in Preview — one placement law, the stamp plugin's.
      if ('assetId' in mark) {
        const library = stamp();
        if (!library) throw new Error('[signature] no stamp plugin to place an asset');
        await library.placeAsset(documentId(), mark.assetId, target);
      } else {
        await ctx.get(AnnotationToken).placeStamp({ source: mark.source }, target);
      }
      return;
    }
    switch (mode()) {
      case 'sign':
        await signField({ field: target.field, mark });
        return;
      case 'visual':
        await fillField(target.field, mark);
        return;
      case 'ask':
        changed.emit({ type: 'ask', field: target.field, mark });
        return;
    }
  };

  const setTarget = (field: FormFieldRef | null): void => {
    const current = state().target;
    if (current === field || (current && field && sameRef(current, field))) return;
    ctx.dispatch({ type: 'TARGET', field });
    changed.emit({ type: 'target', field });
  };

  // ── live: pendings, versions, remote signings ───────────────────────────
  const doc = ctx.doc;
  if (doc) {
    const unsubscribe = doc.events.subscribe((event: DocumentEvent) => {
      switch (event.type) {
        case 'signature.prepared':
          ctx.dispatch({
            type: 'PENDING',
            pending: { signingId: event.signingId, field: event.field },
          });
          return;
        case 'signature.aborted':
          ctx.dispatch({ type: 'PENDING', pending: null });
          return;
        case 'signature.completed':
          ctx.dispatch({ type: 'PENDING', pending: null });
          return;
        case 'document.versioned':
        case 'stream.desynced':
          // Byte-level facts moved: re-read them and re-judge.
          void refresh()
            .then(() => validate())
            .catch((error) => globalThis.console?.error('[signature] refresh failed:', error));
          return;
        case 'form.fieldCreated':
        case 'form.fieldDeleted':
        case 'form.widgetAttached':
        case 'form.widgetDetached':
        case 'form.imported':
        case 'form.repaired':
          // The field set changed (a signature field authored or removed, here
          // or remotely): the snapshot lists fields, so re-read it.
          void refresh().catch((error) =>
            globalThis.console?.error('[signature] refresh failed:', error),
          );
          return;
        default:
          return;
      }
    });
    ctx.cleanup(unsubscribe);
  }

  return {
    snapshot: () => state().snapshot,
    verdicts: () => state().verdicts,
    protection: () => state().snapshot?.protection ?? null,
    pending: () => state().pending,
    target: () => state().target,
    busy: () => state().busy,
    mode,
    signatureOf,
    verdictOf,
    canSign: () => allows('doc.sign') && config.signer != null,
    canFill: () => allows('doc.forms.fill') && ctx.doc?.forms.setSignatureAppearance != null,
    canCertify: () => config.allowCertify === true && allows('doc.sign.certify'),
    signField,
    fillField,
    clearField,
    placeMark,
    setTarget,
    inspect: (field) => changed.emit({ type: 'inspect', field }),
    refresh,
    validate,
    analyze,
    revisionBytes: (revisionIndex) => requireSignatures().signatures.revisionBytes(revisionIndex),
    onChanged: changed.on,
  };
}
