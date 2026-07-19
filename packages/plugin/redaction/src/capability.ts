import type { DocCapability, PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/internal';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { SelectionToken } from '@embedpdf/plugin-selection';
import type {
  AnnotationDTO,
  AnnotationRef,
  PdfRect,
  RedactionApplyResult,
} from '@embedpdf/engine-core';
import type {
  RedactionAction,
  RedactionCapability,
  RedactionLabelPatch,
  RedactionPendingItem,
  RedactionState,
} from './types';

/** Applying destroys content — its own granted power, narrower than annotate. */
const REDACT_CAPABILITY: DocCapability = 'doc.redact';

/** The annotation plugin's model-id convention for a durable ref. */
const idOf = (ref: AnnotationRef): string =>
  ref.kind === 'objectNumber'
    ? `obj:${ref.annotObjectNumber}`
    : ref.kind === 'nm'
      ? `nm:${ref.nm}`
      : `idx:${ref.pageObjectNumber}:${ref.index}`;

type RedactDTO = Extract<AnnotationDTO, { subtype: 'redact' }>;

/** The PDF-space regions a redact mark targets: its quads' boxes, else `/Rect`. */
function regionsOf(dto: RedactDTO): PdfRect[] {
  if (dto.quadPoints.length === 0) return [dto.rect];
  return dto.quadPoints.map((q) => {
    const xs = [q.p1.x, q.p2.x, q.p3.x, q.p4.x];
    const ys = [q.p1.y, q.p2.y, q.p3.y, q.p4.y];
    return {
      left: Math.min(...xs),
      right: Math.max(...xs),
      bottom: Math.min(...ys),
      top: Math.max(...ys),
    };
  });
}

/** Positive-area intersection — the engine's collateral rule. */
const intersects = (a: PdfRect, b: PdfRect): boolean =>
  Math.min(a.right, b.right) > Math.max(a.left, b.left) &&
  Math.min(a.top, b.top) > Math.max(a.bottom, b.bottom);

export function createRedactionCapability(
  ctx: PluginContext<RedactionState, RedactionAction>,
): RedactionCapability {
  const anno = ctx.get(AnnotationToken);
  const appliedCallbacks = new Set<(result: RedactionApplyResult) => void>();

  const requireDoc = () => {
    const doc = ctx.doc;
    if (!doc) throw new Error('[redaction] no document bound');
    return doc;
  };
  const requireService = () => {
    const doc = requireDoc();
    if (!doc.redaction) throw new Error('[redaction] engine has no redaction service');
    return doc.redaction;
  };

  const pons = (): number[] => (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber);

  const pageIndexOf = (pon: number): number =>
    ctx.document()?.pages.find((p) => p.pageObjectNumber === pon)?.index ?? -1;

  const pendingOn = (pon: number): RedactDTO[] =>
    anno.list(pon).filter((a): a is RedactDTO => a.subtype === 'redact');

  const collectPending = (): RedactionPendingItem[] => {
    const items: RedactionPendingItem[] = [];
    for (const pon of pons()) {
      for (const dto of pendingOn(pon)) {
        items.push({
          id: idOf(dto.ref),
          ref: dto.ref,
          pageObjectNumber: pon,
          pageIndex: pageIndexOf(pon),
          kind: dto.quadPoints.length > 0 ? 'text' : 'area',
          overlayText: dto.overlayText,
        });
      }
    }
    return items;
  };

  const fireApplied = (result: RedactionApplyResult) => {
    for (const cb of appliedCallbacks) {
      try {
        cb(result);
      } catch (err) {
        console.error('[redaction] onApplied callback failed', err);
      }
    }
  };

  const runApply = async (
    scope: Parameters<ReturnType<typeof requireService>['apply']>[0],
  ): Promise<RedactionApplyResult> => {
    const service = requireService();
    ctx.dispatch({ type: 'APPLY_STARTED' });
    try {
      const result = await service.apply(scope);
      ctx.dispatch({ type: 'APPLY_FINISHED', result });
      fireApplied(result);
      return result;
    } catch (err) {
      ctx.dispatch({ type: 'APPLY_FINISHED', result: null });
      throw err;
    }
  };

  // A REMOTE collaborator's apply arrives only as a document event (own
  // applies flow through runApply above). Annotation state + raster
  // invalidation are handled by their own planes; here we only surface it.
  const doc = ctx.doc;
  if (doc) {
    ctx.cleanup(
      doc.events.subscribe((event) => {
        if (event.type !== 'redaction.applied') return;
        if (event.origin.kind !== 'remote') return;
        ctx.dispatch({ type: 'APPLY_FINISHED', result: event });
        fireApplied(event);
      }),
    );
  }

  return {
    canApply: () =>
      (ctx.doc?.redaction !== undefined && ctx.doc?.security.allows(REDACT_CAPABILITY)) ?? false,
    isApplying: () => ctx.getState().applying,
    lastResult: () => ctx.getState().lastResult,

    enableRedact: () => ctx.tryGet(InteractionToken)?.activateTool('redact'),
    toggleRedact: () => {
      const interaction = ctx.tryGet(InteractionToken);
      if (!interaction) return;
      interaction.activateTool(interaction.activeToolId() === 'redact' ? 'pointer' : 'redact');
    },
    isRedactActive: () => ctx.tryGet(InteractionToken)?.activeToolId() === 'redact',

    queueCurrentSelection: async () => {
      const selection = ctx.tryGet(SelectionToken);
      if (!selection || !selection.hasSelection()) return false;
      const snapshot = selection.snapshot();
      for (const page of snapshot.pages) {
        if (page.rects.length === 0) continue;
        anno.createMarkup('redact', page.pon, page.rects, 'redact');
      }
      selection.clear();
      return true;
    },

    preparePending: async () => {
      await Promise.all(pons().map((pon) => anno.ensurePage(pon)));
    },
    getPending: collectPending,
    pendingCount: () => collectPending().length,

    estimateCollateral: (ids) => {
      const wanted = ids ? new Set(ids) : null;
      let count = 0;
      for (const pon of pons()) {
        const all = anno.list(pon);
        const marks = all.filter(
          (a): a is RedactDTO => a.subtype === 'redact' && (!wanted || wanted.has(idOf(a.ref))),
        );
        if (marks.length === 0) continue;
        const regions = marks.flatMap(regionsOf);
        for (const other of all) {
          if (other.subtype === 'redact') continue;
          if (regions.some((r) => intersects(r, other.rect))) count++;
        }
      }
      return count;
    },

    setLabel: async (ref, patch: RedactionLabelPatch) => {
      const current = anno.get(ref);
      if (!current || current.subtype !== 'redact') {
        throw new Error('[redaction] setLabel target is not a redact annotation');
      }
      // Always carry the current /DA styling: the engine rewrites /DA whenever
      // a label field rides a patch, so a text-only edit must not let the
      // styling fall back to defaults.
      await anno.update(ref, {
        subtype: 'redact',
        ...(patch.overlayText !== undefined ? { overlayText: patch.overlayText } : {}),
        ...(patch.repeat !== undefined ? { repeat: patch.repeat } : {}),
        fontFamily: current.fontFamily,
        fontSize: current.fontSize,
        fontColor: current.fontColor,
        textAlign: current.textAlign,
      });
    },

    apply: async (ids) => {
      const wanted = new Set(ids);
      const refs = collectPending()
        .filter((p) => wanted.has(p.id))
        .map((p) => p.ref);
      if (refs.length === 0) throw new Error('[redaction] no matching pending redactions');
      return runApply({ kind: 'annotations', refs });
    },

    applyAll: async () => {
      // Pages scope: authoritative for the WHOLE document, including marks on
      // pages this client never loaded. Pages without marks report 'unchanged'.
      const pageObjectNumbers = pons();
      if (pageObjectNumbers.length === 0) throw new Error('[redaction] document has no pages');
      return runApply({ kind: 'pages', pageObjectNumbers });
    },

    onApplied: (cb) => {
      appliedCallbacks.add(cb);
      return () => appliedCallbacks.delete(cb);
    },
  };
}
