/**
 * The annotation selection strip — v2's floating "selection menu" rebuilt as
 * chrome. Three parties, none of them this file's business to compute:
 *
 *   config/chrome.ts `strips.annotation`  declares WHAT may appear
 *   each command's visible/enabled        decides WHICH items show
 *   <AnnotationMenu>                      solves WHERE (camera transform,
 *                                         rotate-knob dodging, pointer isolation)
 *
 * useStripView is the live intersection: hidden commands drop out, empty
 * groups vanish, null when nothing applies. This file only draws pixels.
 * Mounted in the Stage `overlay` slot.
 */
import { Fragment } from 'react';
import { AnnotationMenu } from '@embedpdf/react/annotation-menu';
import { useStripView } from '@embedpdf/react/toolbar';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import { useT } from '@embedpdf/react/i18n';
import { getStrip } from '../config/chrome';
import { buttonClass } from './toolbar';
import { Icon } from './icons';

function StripButton({ cmd, run }: { cmd: ResolvedCommand; run: () => void }) {
  return (
    <button
      type="button"
      onClick={run}
      disabled={!cmd.enabled}
      aria-pressed={cmd.active || undefined}
      aria-label={cmd.label}
      title={cmd.label}
      className={buttonClass(cmd.active, cmd.enabled)}
    >
      {cmd.icon && <Icon name={cmd.icon} size={20} accent={cmd.iconAccent} />}
    </button>
  );
}

export function AnnotationStrip() {
  const t = useT();
  const view = useStripView(getStrip('annotation'));
  if (!view) return null;
  return (
    <AnnotationMenu placement="bottom" gap={15}>
      {() => (
        <div
          role="toolbar"
          aria-label={t('commands.annotate.strip')}
          className="border-border-subtle bg-elevated flex items-center gap-1 rounded-lg border p-1 shadow-xl"
        >
          {view.groups.map((g, i) => (
            <Fragment key={g.id}>
              {i > 0 && <span aria-hidden className="bg-border h-5 w-px" />}
              {g.commands.map((cmd) => (
                <StripButton key={cmd.id} cmd={cmd} run={() => view.execute(cmd.id)} />
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </AnnotationMenu>
  );
}
