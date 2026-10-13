/**
 * The text-selection floating strip:
 *
 *   config/chrome.ts `strips.selection`  declares what may appear
 *   each command's visible/enabled       decides which items show
 *   <SelectionMenu>                      solves where (settles on pointer-up,
 *                                        camera transform, pointer isolation):
 *                                        above the selection, below it without
 *                                        room above
 *
 * `useStripView` is the live intersection: with copy denied (no
 * doc.text.copy) every command drops out and this renders nothing — no
 * empty bubble. Mounted in the Stage `overlay` slot.
 */
import { SelectionMenu } from '@embedpdf/react/selection';
import { useStripView } from '@embedpdf/react/toolbar';
import { useT } from '@embedpdf/react/i18n';
import { useLayoutEnv, useStripSchema } from '../config-context';
import { StripBar } from './strip-bar';

/** Px between the selection and its bar. */
const GAP_PX = 12;

/**
 * On a touch screen the bar also keeps clear of the selection's handles: the 12 px head each one
 * has beyond the first or last line, and the 14 px around it a finger grabs (the handles'
 * geometry in `@embedpdf/plugin-selection`).
 */
const TOUCH_GAP_PX = GAP_PX + 12 + 14;

export function SelectionStrip() {
  const t = useT();
  const { touch } = useLayoutEnv();
  const view = useStripView(useStripSchema('selection'));
  if (!view) return null;
  return (
    <SelectionMenu placement="top" gap={touch ? TOUCH_GAP_PX : GAP_PX}>
      <StripBar view={view} label={t('commands.selection.strip')} />
    </SelectionMenu>
  );
}
