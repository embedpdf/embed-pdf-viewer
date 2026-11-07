/**
 * The snapshot's floating strip:
 *
 *   config/chrome.ts `strips.snapshot`  declares what may appear (copy, save)
 *   each command's visible/enabled      decides which items show
 *   <SnapshotMenu>                      solves where (camera transform, pointer
 *                                       isolation): below the box the snapshot
 *                                       tool holds, above it without room below
 *
 * It shows once the box is let go, and goes with the snapshot: a copy, Escape
 * or another tool. Mounted in the Stage `overlay` slot. The pixels are the
 * shared <StripBar>.
 */
import { SnapshotMenu } from '@embedpdf/react/render';
import { useStripView } from '@embedpdf/react/toolbar';
import { useT } from '@embedpdf/react/i18n';
import { useStripSchema } from '../config-context';
import { StripBar } from './strip-bar';

/** Px between the box and its bar, as for selected text. */
const GAP_PX = 12;

export function SnapshotStrip() {
  const t = useT();
  const bar = useStripSchema('snapshot');
  const view = useStripView(bar);
  if (!bar || !view) return null;
  return (
    <SnapshotMenu placement="bottom" gap={GAP_PX}>
      <StripBar bar={bar} view={view} label={t('commands.snapshot.strip')} />
    </SnapshotMenu>
  );
}
