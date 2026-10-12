/**
 * The panels a layout brings, as commands. Every panel gets `panel:<id>`, which
 * opens and closes it, labeled and drawn as the layout's panel says (its
 * `title` or `titleKey`, its `icon`). Which side a panel is on is the layout's
 * too; the panels on one side take turns where they're drawn (ui/panels.tsx).
 * The built-in panels add what their commands need: the feature that turns
 * them off, what the scope must allow, and when there is something to show.
 */
import { panelCommandOf, type LayoutData, type LayoutPanel } from '@embedpdf/core-ui';
import type { CommandDef } from '@embedpdf/react/commands';
import { RedactionToken } from '@embedpdf/react/redaction';
import { SignatureToken } from '@embedpdf/react/signature';
import { StampToken } from '@embedpdf/react/stamp';

import type { Feature } from '../features';
import type { PanelSide } from '../ui/panel-layout';

type Panels = NonNullable<LayoutData['panels']>;

const isPanel = (value: unknown): value is LayoutPanel =>
  typeof value === 'object' && value !== null;

/** The side a panel opens on: `end` unless it says `start`. */
export const panelSideOf = (panel: LayoutPanel): PanelSide =>
  panel.side === 'start' ? 'start' : 'end';

/** The ids of the layout's panels on `side`, in layout order. */
export function panelsOnSide(data: LayoutData, side: PanelSide): string[] {
  return Object.entries(data.panels ?? {})
    .filter(([, panel]) => isPanel(panel) && panelSideOf(panel) === side)
    .map(([id]) => id);
}

/** What a built-in panel's command adds to the layout's panel. */
type PanelCommandFacts = Pick<CommandDef, 'requires' | 'visible'> & {
  readonly categories: readonly Feature[];
};

const BUILT_IN_PANELS: ReadonlyMap<string, PanelCommandFacts> = new Map<string, PanelCommandFacts>([
  ['thumbnails', { categories: ['thumbnails'] }],
  // The engine reads no outline, and no plugin lists the document's attached files: these two
  // panels have nothing to show, so they never show.
  ['outline', { categories: ['outline'], visible: () => false }],
  ['attachments', { categories: ['attachments'], visible: () => false }],
  // Without it every query is refused: the panel has no job.
  ['search', { categories: ['search'], requires: ['doc.text.search'] }],
  // Without it there is nothing this panel could show.
  ['comments', { categories: ['comments'], requires: ['doc.annotate.read'] }],
  ['style', { categories: ['annotations'] }],
  // The stamp libraries are the stamp plugin's: without it there is nothing to pick.
  [
    'stamps',
    {
      categories: ['stamps'],
      requires: ['annotations:create'],
      visible: (commandContext) => commandContext.tryGet(StampToken) != null,
    },
  ],
  // A person's marks are stamp libraries; the document's signatures are the signature plugin's.
  [
    'signatures',
    {
      categories: ['signatures'],
      visible: (commandContext) =>
        commandContext.tryGet(StampToken) != null && commandContext.tryGet(SignatureToken) != null,
    },
  ],
  // Useful to a session that can propose marks or apply them; with neither power the panel
  // could only show other people's pending marks. Either one is enough, which `requires` (all
  // of them) can't say.
  [
    'redaction',
    {
      categories: ['redaction'],
      visible: (commandContext) => {
        const redaction = commandContext.tryGet(RedactionToken);
        return redaction ? redaction.canMark() || redaction.canApply() : true;
      },
    },
  ],
  ['measurement', { categories: ['measurement'] }],
]);

/**
 * A `panel:<id>` command for each of the layout's panels that has none yet (`isTaken` says which
 * ids do): it opens the panel, or closes it when it's open. Without a title, its button reads
 * the panel's id.
 */
export function panelCommandsFor(
  panels: LayoutData['panels'],
  isTaken: (id: string) => boolean,
): CommandDef[] {
  return Object.entries(panels ?? {}).flatMap(([id, panel]): CommandDef[] => {
    const commandId = panelCommandOf(id);
    if (!isPanel(panel) || isTaken(commandId)) return [];
    return [
      {
        id: commandId,
        label: panel.title ?? (panel.titleKey === undefined ? id : undefined),
        labelKey: panel.titleKey,
        icon: panel.icon,
        panel: id,
        ...BUILT_IN_PANELS.get(id),
      },
    ];
  });
}

/** Whether two layouts' panels are the same, field for field. */
export const samePanels = (left: Panels | undefined, right: Panels | undefined): boolean =>
  left === right || JSON.stringify(left ?? {}) === JSON.stringify(right ?? {});
