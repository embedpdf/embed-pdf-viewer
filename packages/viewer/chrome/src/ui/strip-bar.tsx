/**
 * The floating strip's PIXELS, shared by every contextual strip (annotation
 * selection, text selection, …): a rounded toolbar of command buttons with
 * derived group separators. The WHERE is each strip's menu component
 * (`<AnnotationMenu>`, `<SelectionMenu>`); the WHICH is the commands'
 * `visible`/`enabled` derivations via `useStripView`. This file only draws.
 */
import { Fragment } from 'react';
import type { ResolvedCommand } from '@embedpdf/react/commands';
import type { useStripView } from '@embedpdf/react/toolbar';
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

export function StripBar({
  view,
  label,
}: {
  view: NonNullable<ReturnType<typeof useStripView>>;
  label: string;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
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
  );
}
