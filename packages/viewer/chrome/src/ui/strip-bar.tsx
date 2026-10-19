/**
 * The floating strip's pixels, shared by every contextual strip (annotation
 * selection, text selection, …): a rounded toolbar of command buttons with
 * derived group separators. The where is each strip's menu component
 * (`<AnnotationMenu>`, `<SelectionMenu>`); the which is the commands'
 * `visible`/`enabled` derivations via `useStripView`. This file only draws.
 *
 * The strips sit above what's selected, and below it when there's no room, so
 * a menu from one opens on the strip's side, away from the selection (the
 * `selection` edge); it flips when there's no room there. Each strip is a
 * `toolbar` part and its buttons `toolbar-button` parts, like any bar's.
 */
import type { ResolvedCommand } from '@embedpdf/react/commands';
import type { useStripView } from '@embedpdf/react/toolbar';
import { Fragment } from 'react';

import { BarEdgeProvider } from './bar-edge';
import { Icon } from './icons';
import { MenuAnchor } from './menu';
import { buttonClass, buttonPart } from './toolbar';

function StripButton({ cmd, run }: { cmd: ResolvedCommand; run: () => void }) {
  // A menu command is active while its menu is open at this button: it says it's expanded.
  const draw = (active: boolean) => (
    <button
      type="button"
      onClick={run}
      disabled={!cmd.enabled}
      aria-pressed={cmd.menu ? undefined : active || undefined}
      aria-haspopup={cmd.menu ? 'menu' : undefined}
      aria-expanded={cmd.menu ? active : undefined}
      aria-label={cmd.label}
      title={cmd.label}
      part={buttonPart(active)}
      className={buttonClass(active, cmd.enabled)}
    >
      {cmd.icon && <Icon name={cmd.icon} size={20} accent={cmd.iconAccent} />}
    </button>
  );
  if (!cmd.menu) return draw(cmd.active);
  return <MenuAnchor menuId={cmd.menu}>{draw}</MenuAnchor>;
}

export function StripBar({
  view,
  label,
}: {
  view: NonNullable<ReturnType<typeof useStripView>>;
  label: string;
}) {
  return (
    <BarEdgeProvider value="selection">
      <div
        role="toolbar"
        aria-label={label}
        part="toolbar"
        className="border-border-subtle bg-elevated flex items-center gap-1 rounded-lg border p-1 shadow-xl"
      >
        {view.groups.map((group, i) => (
          <Fragment key={group.id}>
            {i > 0 && <span aria-hidden className="bg-border h-5 w-px" />}
            {group.commands.map((cmd) => (
              <StripButton key={cmd.id} cmd={cmd} run={() => view.execute(cmd.id)} />
            ))}
          </Fragment>
        ))}
      </div>
    </BarEdgeProvider>
  );
}
