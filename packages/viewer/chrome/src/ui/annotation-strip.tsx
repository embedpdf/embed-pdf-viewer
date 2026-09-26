/**
 * The annotation-selection floating strip:
 *
 *   config/chrome.ts `strips.annotation`  declares what may appear
 *   each command's visible/enabled        decides which items show
 *   <AnnotationMenu>                      solves where (camera transform,
 *                                         rotate-knob dodging, pointer isolation)
 *
 * useStripView is the live intersection: hidden commands drop out, empty
 * groups vanish, null when nothing applies. Mounted in the Stage `overlay`
 * slot. The pixels are the shared <StripBar>.
 */
import { useEffect } from 'react';
import { AnnotationMenu } from '@embedpdf/react/annotation-menu';
import { useAnnotationSelection } from '@embedpdf/react/annotation';
import { useSurface } from '@embedpdf/react/shell';
import { useStripView } from '@embedpdf/react/toolbar';
import { useT } from '@embedpdf/react/i18n';
import { useStripSchema } from '../config-context';
import { LinkEditorCard } from './link-editor';
import { StripBar } from './strip-bar';

export function AnnotationStrip() {
  const t = useT();
  const view = useStripView(useStripSchema('annotation'));
  // The link editor popover rides the same anchor and replaces the strip
  // while open — one anchored card at a time, on the projector.
  const editor = useSurface('link-editor');
  const selection = useAnnotationSelection();
  // A stale editor never outlives its selection.
  useEffect(() => {
    if (!selection.length && editor.isOpen) editor.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection.length, editor.isOpen]);
  if (!view) return null;
  return (
    <AnnotationMenu placement="bottom" gap={15}>
      {editor.isOpen ? (
        <LinkEditorCard onClose={editor.close} />
      ) : (
        <StripBar view={view} label={t('commands.annotate.strip')} />
      )}
    </AnnotationMenu>
  );
}
