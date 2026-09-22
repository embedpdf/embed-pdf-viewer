/**
 * Script world building (a page-scoped prefetch: the forms snapshot plus the
 * annotations of the page the action runs on) and the event bridge between
 * two standards: the /AA keys are ISO 32000-2 Table 200; the event names
 * live in the JavaScript API layer (ISO 21757-1, Acrobat).
 */
import type { PluginContext } from '@embedpdf/core';
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

export function createScriptWorld(ctx: PluginContext<void>) {
  const engineColorToArray = (
    color: { r: number; g: number; b: number } | null | undefined,
  ): ScriptColorArray => (color ? ['RGB', color.r / 255, color.g / 255, color.b / 255] : ['T']);

  const scriptWorldFor = async (
    pageObjectNumber: PageObjectNumber,
  ): Promise<{ snapshot: FormSnapshot; world: Omit<ScriptWorldInput, 'event'> }> => {
    const page = toPageRef(pageObjectNumber);
    const snapshot = await ctx.doc.forms.list();
    const pageIndex = Math.max(0, ctx.getPage(page)?.index ?? -1);
    const { annotations } = await ctx.doc.page(page).annotations.list();
    const annots: ScriptAnnotInput[] = annotations
      // Script-addressable = everything except links and widgets (they are
      // Link and Field objects in Acrobat and separate planes here).
      .filter(
        (annotation) => annotation.subtype !== 'link' && !annotation.subtype.startsWith('widget'),
      )
      .map((annotation) => {
        const styled = annotation as unknown as {
          color?: { r: number; g: number; b: number };
          interiorColor?: { r: number; g: number; b: number } | null;
          opacity?: number;
          strokeWidth?: number;
          borderStyle?: string;
          dashArray?: number[];
        };
        return {
          ref: annotation.ref,
          name: annotation.nm ?? '',
          subtype: annotation.subtype,
          page: pageIndex,
          rect: [
            annotation.rect.left,
            annotation.rect.bottom,
            annotation.rect.right,
            annotation.rect.top,
          ] as [number, number, number, number],
          contents: annotation.contents ?? '',
          author: annotation.author ?? '',
          subject: annotation.subject ?? '',
          strokeColor: engineColorToArray(styled.color),
          fillColor: engineColorToArray(styled.interiorColor),
          opacity: styled.opacity ?? 1,
          width: styled.strokeWidth ?? 1,
          borderStyle: styled.borderStyle === 'dashed' ? ('D' as const) : ('S' as const),
          dash: styled.dashArray ?? [],
          hidden: annotation.flags.hidden,
          print: annotation.flags.print,
          readOnly: annotation.flags.readOnly,
          locked: annotation.flags.locked,
          noView: annotation.flags.noView,
          toggleNoView: annotation.flags.toggleNoView,
          opaqueBody: annotation.subtype === 'stamp',
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
    // /PV and /PI have no Acrobat event name: these two are an EmbedPDF extension.
    visible: 'Visible',
    invisible: 'Invisible',
  };
  // The /AA keys are ISO 32000-2 Table 200; the event names live in the
  // JavaScript API layer (ISO 21757-1, Acrobat).
  const DOC_EVENT_NAMES: Record<string, string> = {
    open: 'Open',
    'will-save': 'WillSave',
    'did-save': 'DidSave',
    'will-print': 'WillPrint',
    'did-print': 'DidPrint',
    'will-close': 'WillClose',
  };

  const scriptEventFor = (
    actionContext: ActionContext,
    snapshot: FormSnapshot,
  ): ScriptEventInput => {
    const provenance = actionContext.event;
    const type =
      provenance.scope === 'page'
        ? 'Page'
        : provenance.scope === 'document'
          ? 'Doc'
          : actionContext.source.kind === 'widget'
            ? 'Field'
            : actionContext.source.kind === 'link'
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
    const targetRef =
      actionContext.source.kind === 'widget' ? actionContext.source.field : undefined;
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
