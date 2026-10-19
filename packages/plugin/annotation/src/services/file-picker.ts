import type { Point } from '@embedpdf/core-annotation';
import { toPageRef, type AttachmentFileSource } from '@embedpdf/engine-core/runtime';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import type { FilePickerProvider, FilePromptRequest } from '../contract';
import type { AnnotationContext } from './context';
import type { ResolvedTool } from '../tools/definitions';

/**
 * The one file-picker port (a DOM file dialog, wired by the framework
 * adapter): every click-then-pick tool — a stamp `'prompt'` source, the file
 * attachment tool — resolves its bytes through this slot. See
 * {@link FilePickerProvider}.
 */
export function createFilePickerPort(ctx: Pick<AnnotationContext, 'doc' | 'tryGet'>) {
  let provider: FilePickerProvider | null = null;

  const set = (next: FilePickerProvider | null) => {
    provider = next;
    return () => {
      if (provider === next) provider = null;
    };
  };

  /**
   * Run the installed provider for a click-then-pick tool, with the shared
   * expiry rule: the placement is dropped if the picker cancels, or if the
   * document or the active tool changed while it was open (the intent
   * expired with the click). No provider installed → decline the click (let a
   * lower-priority handler act) rather than swallow it.
   */
  const promptAt = (
    tool: ResolvedTool,
    pageObjectNumber: number,
    point: Point,
    place: (picked: AttachmentFileSource) => void,
  ): boolean => {
    const current = provider;
    if (!current) return false;
    const spec = tool.source;
    const request: FilePromptRequest = {
      toolId: tool.id,
      subtype: tool.subtype,
      accept: spec?.kind === 'prompt' ? spec.accept : undefined,
      page: toPageRef(pageObjectNumber),
      point,
    };
    const docAtClick = ctx.doc;
    current(request).then(
      (picked) => {
        if (!picked) return; // cancelled
        if (ctx.doc !== docAtClick) return; // document changed underneath
        if (ctx.tryGet(InteractionToken)?.getActiveToolId() !== tool.id) return; // tool changed
        place(picked);
      },
      (error) => console.error('[annotation] file-picker provider failed:', error),
    );
    return true;
  };

  return { set, promptAt };
}

export type FilePickerPort = ReturnType<typeof createFilePickerPort>;
