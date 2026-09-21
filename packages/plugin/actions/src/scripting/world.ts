/**
 * Script world building (D6: page-scoped prefetch) and the two-standard
 * event bridge (D5): the /AA keys are ISO 32000-2 Table 200; the camelCase
 * event names live in the JS API layer (ISO 21757-1 / Acrobat).
 */
import { scriptFieldsFromSnapshot } from '@embedpdf/core-acrojs';
import type {
  ScriptAnnotInput,
  ScriptColorArray,
  ScriptEventInput,
  ScriptWorldInput,
} from '@embedpdf/core-acrojs';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import type { FormSnapshot, PageObjectNumber } from '@embedpdf/engine-core/runtime';

import type { ActionContext } from '../contract';
import type { ActionsContext } from '../services';

export function createScriptWorld(ctx: ActionsContext) {
  const engineColorToArray = (
    color: { r: number; g: number; b: number } | null | undefined,
  ): ScriptColorArray => (color ? ['RGB', color.r / 255, color.g / 255, color.b / 255] : ['T']);

  const pageIndexOf = (pon: PageObjectNumber): number =>
    ctx.document()?.pages.findIndex((page) => page.ref.pageObjectNumber === pon) ?? -1;

  const scriptWorldFor = async (
    pon: PageObjectNumber,
  ): Promise<{ snapshot: FormSnapshot; world: Omit<ScriptWorldInput, 'event'> }> => {
    const doc = ctx.doc!;
    const snapshot = await doc.forms.list();
    const pageIndex = Math.max(0, pageIndexOf(pon));
    const { annotations } = await doc.page(toPageRef(pon)).annotations.list();
    const annots: ScriptAnnotInput[] = annotations
      // Script-addressable = everything EXCEPT link and widget (they are
      // Link/Field objects in Acrobat and separate planes here).
      .filter((a) => a.subtype !== 'link' && !a.subtype.startsWith('widget'))
      .map((a) => {
        const styled = a as unknown as {
          color?: { r: number; g: number; b: number };
          interiorColor?: { r: number; g: number; b: number } | null;
          opacity?: number;
          strokeWidth?: number;
          borderStyle?: string;
          dashArray?: number[];
        };
        return {
          ref: a.ref,
          name: a.nm ?? '',
          subtype: a.subtype,
          page: pageIndex,
          rect: [a.rect.left, a.rect.bottom, a.rect.right, a.rect.top] as [
            number,
            number,
            number,
            number,
          ],
          contents: a.contents ?? '',
          author: a.author ?? '',
          subject: a.subject ?? '',
          strokeColor: engineColorToArray(styled.color),
          fillColor: engineColorToArray(styled.interiorColor),
          opacity: styled.opacity ?? 1,
          width: styled.strokeWidth ?? 1,
          borderStyle: styled.borderStyle === 'dashed' ? ('D' as const) : ('S' as const),
          dash: styled.dashArray ?? [],
          hidden: a.flags.hidden,
          print: a.flags.print,
          readOnly: a.flags.readOnly,
          locked: a.flags.locked,
          noView: a.flags.noView,
          toggleNoView: a.flags.toggleNoView,
          opaqueBody: a.subtype === 'stamp',
        };
      });
    return {
      snapshot,
      world: {
        fields: scriptFieldsFromSnapshot(snapshot),
        annots,
        annotPages: [pageIndex],
        annotsCoverDocument: (ctx.document()?.pageCount ?? 0) <= 1,
      },
    };
  };

  const ANNOTATION_EVENT_NAMES: Record<string, string> = {
    cursorEnter: 'Mouse Enter',
    cursorExit: 'Mouse Exit',
    mouseDown: 'Mouse Down',
    mouseUp: 'Mouse Up',
    focus: 'Focus',
    blur: 'Blur',
  };
  const PAGE_EVENT_NAMES: Record<string, string> = {
    open: 'Open',
    close: 'Close',
    // No Acrobat equivalent for the PV/PI names — EmbedPDF extension.
    visible: 'Visible',
    invisible: 'Invisible',
  };
  // The two-standard bridge (D5): the /AA keys are ISO 32000-2 Table 200;
  // the camelCase event names live in the JS API layer (ISO 21757-1 /
  // Acrobat) — only the key half is verifiable against the in-repo spec.
  const DOC_EVENT_NAMES: Record<string, string> = {
    open: 'Open',
    'will-save': 'WillSave',
    'did-save': 'DidSave',
    'will-print': 'WillPrint',
    'did-print': 'DidPrint',
    'will-close': 'WillClose',
  };

  const scriptEventFor = (actionCtx: ActionContext, snapshot: FormSnapshot): ScriptEventInput => {
    const provenance = actionCtx.event;
    const type =
      provenance.scope === 'page'
        ? 'Page'
        : provenance.scope === 'document'
          ? 'Doc'
          : actionCtx.source.kind === 'widget'
            ? 'Field'
            : actionCtx.source.kind === 'link'
              ? 'Link'
              : 'Annot'; // EmbedPDF extension — Acrobat has no plain-annot type
    const name =
      provenance.scope === 'activate'
        ? 'Mouse Up'
        : provenance.scope === 'annotation'
          ? (ANNOTATION_EVENT_NAMES[provenance.name] ?? 'Mouse Up')
          : provenance.scope === 'page'
            ? (PAGE_EVENT_NAMES[provenance.name] ?? 'Open')
            : (DOC_EVENT_NAMES[provenance.name] ?? 'Open');
    const targetRef = actionCtx.source.kind === 'widget' ? actionCtx.source.field : undefined;
    const targetField = targetRef
      ? snapshot.fields.find((field) =>
          targetRef.kind === 'objectNumber' && field.ref.kind === 'objectNumber'
            ? field.ref.fieldObjectNumber === targetRef.fieldObjectNumber
            : targetRef.kind === 'fqn' && field.name === targetRef.name,
        )
      : undefined;
    return {
      kind: 'widget-activate',
      type,
      name,
      ...(targetRef ? { target: targetRef, source: targetRef } : {}),
      ...(targetField && targetField.valueEntry.kind === 'scalar'
        ? { value: targetField.valueEntry.value }
        : {}),
    };
  };

  return { scriptWorldFor, scriptEventFor };
}
