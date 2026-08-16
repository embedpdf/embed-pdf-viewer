/**
 * The ANNOTATION-selection floating strip:
 *
 *   config/chrome.ts `strips.annotation`  declares WHAT may appear
 *   each command's visible/enabled        decides WHICH items show
 *   <AnnotationMenu>                      solves WHERE (camera transform,
 *                                         rotate-knob dodging, pointer isolation)
 *
 * useStripView is the live intersection: hidden commands drop out, empty
 * groups vanish, null when nothing applies. Mounted in the Stage `overlay`
 * slot. The pixels are the shared <StripBar>.
 */
import { AnnotationMenu } from '@embedpdf/react/annotation-menu';
import { useStripView } from '@embedpdf/react/toolbar';
import { useT } from '@embedpdf/react/i18n';
import { useStripSchema } from '../config-context';
import { StripBar } from './strip-bar';

export function AnnotationStrip() {
  const t = useT();
  const view = useStripView(useStripSchema('annotation'));
  if (!view) return null;
  return (
    <AnnotationMenu placement="bottom" gap={15}>
      <StripBar view={view} label={t('commands.annotate.strip')} />
    </AnnotationMenu>
  );
}
