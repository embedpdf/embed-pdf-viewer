/**
 * The TEXT-SELECTION floating strip:
 *
 *   config/chrome.ts `strips.selection`  declares WHAT may appear
 *   each command's visible/enabled       decides WHICH items show
 *   <SelectionMenu>                      solves WHERE (settles on pointer-up,
 *                                        camera transform, pointer isolation)
 *
 * `useStripView` is the live intersection: with copy denied (no
 * doc.text.copy) every command drops out and this renders nothing — no
 * empty bubble. Mounted in the Stage `overlay` slot.
 */
import { SelectionMenu } from '@embedpdf/react/selection';
import { useStripView } from '@embedpdf/react/toolbar';
import { useT } from '@embedpdf/react/i18n';
import { useStripSchema } from '../config-context';
import { StripBar } from './strip-bar';

export function SelectionStrip() {
  const t = useT();
  const view = useStripView(useStripSchema('selection'));
  if (!view) return null;
  return (
    <SelectionMenu placement="bottom" gap={12}>
      <StripBar view={view} label={t('commands.selection.strip')} />
    </SelectionMenu>
  );
}
